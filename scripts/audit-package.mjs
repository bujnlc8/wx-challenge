import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const posix = path.posix;
const sourceExtensions = new Set([".js", ".wxs", ".wxss", ".wxml", ".json"]);

// These are upload-tool inputs, not files executed by the Mini Program.
const projectInputs = new Set(["project.config.json", "project.private.config.json"]);

export function isIgnored(file, rules) {
  return rules.some(({ type, value }) => {
    const normalized = value.replace(/^\.\//, "").replace(/\/$/, "");
    if (type === "folder") return file === normalized || file.startsWith(normalized + "/");
    if (type === "file") return file === normalized;
    if (type === "prefix") return file.startsWith(normalized);
    if (type === "suffix") return file.endsWith(value);
    if (type === "regexp") return new RegExp(value).test(file);
    throw new Error(`Unsupported packOptions rule: ${type}`);
  });
}

export function trackedAndNewFiles(root) {
  return [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean))].filter((file) => fs.existsSync(path.join(root, file)));
}

function category(file) {
  if (file.startsWith("images/")) return "images";
  if (file.startsWith("libs/")) return "libraries";
  if (/\.(js|wxs)$/.test(file)) return "scripts";
  if (file.endsWith(".wxss")) return "styles";
  if (file.endsWith(".wxml")) return "templates";
  if (file.endsWith(".json")) return "configuration";
  return "other";
}

export function summarizeFiles(sizes, rules = []) {
  const groups = {};
  const files = Object.keys(sizes).filter((file) => !projectInputs.has(file) && !isIgnored(file, rules));
  for (const file of files) {
    const key = category(file);
    groups[key] ??= { files: 0, bytes: 0 };
    groups[key].files++;
    groups[key].bytes += sizes[file];
  }
  return { files: files.length, bytes: files.reduce((sum, file) => sum + sizes[file], 0), groups };
}

export function auditPackage({ root, files = trackedAndNewFiles(root) }) {
  const config = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
  const rules = config.packOptions?.ignore ?? [];
  if (config.packOptions?.include?.length) throw new Error("Explicit packOptions.include needs review before auditing");
  const allFiles = new Set(files);
  const uploaded = files.filter((file) => !projectInputs.has(file) && !isIgnored(file, rules));
  const uploadedSet = new Set(uploaded);
  const references = [];
  const errors = [];
  const dynamicReferences = [];

  function addReference(owner, raw, extensions = [""]) {
    if (!raw || /^(?:[a-z]+:|\/\/|#)/i.test(raw)) return;
    const clean = raw.replace(/[?#].*$/, "");
    const resolved = posix.normalize(clean.startsWith("/") ? clean.slice(1) : posix.join(posix.dirname(owner), clean));
    const candidates = extensions.map((extension) => resolved + extension);
    const target = candidates.find((candidate) => allFiles.has(candidate));
    if (!target) {
      errors.push(`${owner}: missing local reference ${raw}`);
      return;
    }
    references.push({ owner, target });
    if (!uploadedSet.has(target)) errors.push(`${owner}: referenced file excluded from upload: ${target}`);
  }

  function addAsset(owner, raw) {
    if (raw.includes("{{")) {
      // The product's rank domain is 0 (unranked) through 6 (highest rank).
      // Expanding the domain catches missing ranks even when other ranks exist.
      if (/ui-grade-\{\{[^}]+\}\}\.png$/.test(raw)) {
        for (let rank = 0; rank <= 6; rank++) addReference(owner, raw.replace(/\{\{[^}]+\}\}/, String(rank)));
        dynamicReferences.push({ owner, pattern: raw, variants: 7 });
      } else {
        errors.push(`${owner}: unresolved dynamic local asset ${raw}`);
      }
      return;
    }
    addReference(owner, raw);
  }

  for (const owner of uploaded) {
    const extension = posix.extname(owner);
    if (!sourceExtensions.has(extension)) continue;
    const source = fs.readFileSync(path.join(root, owner), "utf8");
    if (extension === ".json") {
      const json = JSON.parse(source);
      for (const page of [...(json.pages ?? []), ...(json.subPackages ?? json.subpackages ?? []).flatMap((item) => item.pages.map((page) => `${item.root}/${page}`))]) {
        for (const ext of [".js", ".wxml"]) addReference(owner, "/" + page + ext);
      }
      for (const component of Object.values(json.usingComponents ?? {})) {
        if (/^(plugin:|[a-z]+:)/i.test(component)) continue;
        for (const ext of [".js", ".json", ".wxml"]) addReference(owner, component + ext);
      }
      for (const tab of json.tabBar?.list ?? []) {
        addReference(owner, tab.iconPath);
        addReference(owner, tab.selectedIconPath);
      }
      if (json.sitemapLocation) addReference(owner, json.sitemapLocation);
    }
    if (extension === ".js" || extension === ".wxs") {
      const dependencies = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
      for (const match of source.matchAll(dependencies)) {
        if (!/^(\.|\/)/.test(match[1])) continue;
        addReference(owner, match[1], ["", ".js", ".wxs", ".json", "/index.js"]);
      }
    }
    if (extension === ".wxml") {
      for (const match of source.matchAll(/\b(?:src|poster)\s*=\s*["']([^"']+)["']/g)) {
        if (!match[1].includes("{{") || /(?:^|\/)images\//.test(match[1])) addAsset(owner, match[1]);
      }
    }
    if (extension === ".wxss") {
      for (const match of source.matchAll(/@import\s*["']([^"']+)["']|url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) addReference(owner, match[1] ?? match[2]);
    }
    // Canvas image paths also occur as string literals in JavaScript.
    if (extension === ".js") {
      for (const match of source.matchAll(/["']((?:\/|(?:\.\.\/)+|\.\/)?images\/[^"'\r\n]+\.(?:png|svg|jpe?g|gif|webp))["']/g)) addAsset(owner, match[1]);
    }
  }
  const used = new Set(references.map(({ target }) => target));
  const unusedImages = uploaded.filter((file) => file.startsWith("images/") && !used.has(file));
  const sizes = Object.fromEntries(files.map((file) => [file, fs.statSync(path.join(root, file)).size]));
  return {
    basis: "Local uncompiled upload-source files, Git tracked plus new non-ignored files; not the final WeChat compiled package",
    ...summarizeFiles(sizes, rules),
    references: references.length,
    dynamicReferences,
    unusedImages,
    errors: [...new Set(errors)],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditPackage({ root: path.resolve(process.argv[2] ?? ".") });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.errors.length) process.exitCode = 1;
}
