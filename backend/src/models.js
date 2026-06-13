/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {string} location
 * @property {number|null} skillRank
 * @property {number|null} globalSkillScore
 * @property {number|null} globalWildcardScore
 * @property {number|null} accuracy
 */

/**
 * @typedef {Object} LeaderboardSnapshot
 * @property {number} id
 * @property {string} createdAt
 * @property {string|null} sourceLastUpdated
 * @property {number} playerCount
 */

/**
 * @typedef {Object} TrekRun
 * @property {number} [id]
 * @property {number} snapshotId
 * @property {string} playerId
 * @property {string} animal
 * @property {string} weapon
 * @property {string} trek
 * @property {number} score
 * @property {number|null} runRank
 * @property {number} counted
 * @property {string|null} rawLabel
 */

/**
 * @typedef {Object} TrekBenchmark
 * @property {string} animal
 * @property {string} weapon
 * @property {string} trek
 * @property {number} bestScore
 * @property {string} benchmarkPlayerId
 * @property {string} benchmarkPlayerName
 */

/**
 * @typedef {Object} Opportunity
 * @property {string} playerId
 * @property {string} animal
 * @property {string} weapon
 * @property {string} trek
 * @property {number} theoreticalGain
 * @property {number} playerThirdBestScore
 * @property {number[]} playerTopThreeScores
 * @property {number} playerTopThreeTotal
 * @property {number} benchmarkScore
 * @property {string} benchmarkPlayerId
 * @property {string} benchmarkPlayerName
 */

/**
 * @typedef {Object} AdventureOpportunity
 * @property {string} animal
 * @property {string} weapon
 * @property {number} theoreticalGain
 * @property {number} trekCount
 * @property {Opportunity[]} treks
 */

export const MODEL_DOCS = {};
