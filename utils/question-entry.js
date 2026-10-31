// WeChat unlimited codes carry a numeric scene; ordinary challenges keep zero.
function parseQuestionEntry(options) {
  const hasQuestion =
    options && Object.prototype.hasOwnProperty.call(options, "question_id");
  const hasScene =
    options && Object.prototype.hasOwnProperty.call(options, "scene");
  if (!hasQuestion && !hasScene) return 0;
  let value = hasQuestion ? options.question_id : options.scene;
  try {
    value = decodeURIComponent(String(value)).trim();
  } catch (error) {
    return null;
  }
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export { parseQuestionEntry };
