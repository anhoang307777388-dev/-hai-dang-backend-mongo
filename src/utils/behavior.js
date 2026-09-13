// 5 nhóm tiêu chí, mỗi nhóm 4 câu (1.1-1.4, 2.1-2.4, ... 5.1-5.4), mỗi câu 1-5 điểm.
// groupScores: mỗi nhóm tối đa 20 điểm. totalScore: tổng 20 câu, tối đa 100 điểm.
const GROUP_CODES = [1, 2, 3, 4, 5];

function scoreBehaviorAnswers(answers) {
  const groupScores = {};
  let totalScore = 0;

  GROUP_CODES.forEach((g) => {
    let sum = 0;
    for (let i = 1; i <= 4; i++) {
      const key = `${g}.${i}`;
      const v = Number(answers[key]);
      if (!Number.isFinite(v) || v < 1 || v > 5) {
        throw new Error(`Thiếu hoặc sai giá trị câu trả lời cho tiêu chí ${key}.`);
      }
      sum += v;
    }
    groupScores[g] = sum;
    totalScore += sum;
  });

  let level;
  if (totalScore <= 40) level = 'Thấp';
  else if (totalScore <= 65) level = 'Trung bình thấp';
  else if (totalScore <= 85) level = 'Trung bình cao';
  else level = 'Cao';

  return { groupScores, totalScore, level };
}

module.exports = { scoreBehaviorAnswers };
