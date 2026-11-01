const DEFAULT_CHALLENGE_QUESTION_COUNT = 50;
const MAX_CHALLENGE_QUESTION_COUNT = 500;
const CHALLENGE_QUESTION_COUNT_KEY = "challenge_question_count";

function parseChallengeQuestionCount(value) {
  if (typeof value === "string") {
    value = value.trim();
    if (!/^\d+$/.test(value)) return null;
    value = Number(value);
  }
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_CHALLENGE_QUESTION_COUNT
    ? value
    : null;
}

function clampChallengeQuestionCountInput(value) {
  const text = value == null ? "" : String(value);
  return /^\d+(?:\.\d*)?$/.test(text.trim()) &&
    Number(text) > MAX_CHALLENGE_QUESTION_COUNT
    ? String(MAX_CHALLENGE_QUESTION_COUNT)
    : text;
}

function getChallengeQuestionCount(platform = wx) {
  try {
    return (
      parseChallengeQuestionCount(
        platform.getStorageSync(CHALLENGE_QUESTION_COUNT_KEY),
      ) || DEFAULT_CHALLENGE_QUESTION_COUNT
    );
  } catch (error) {
    return DEFAULT_CHALLENGE_QUESTION_COUNT;
  }
}

function setChallengeQuestionCount(value, platform = wx) {
  const count = parseChallengeQuestionCount(value);
  if (count === null) return false;
  try {
    platform.setStorageSync(CHALLENGE_QUESTION_COUNT_KEY, count);
    return true;
  } catch (error) {
    return false;
  }
}

export {
  DEFAULT_CHALLENGE_QUESTION_COUNT,
  MAX_CHALLENGE_QUESTION_COUNT,
  clampChallengeQuestionCountInput,
  getChallengeQuestionCount,
  parseChallengeQuestionCount,
  setChallengeQuestionCount,
};
