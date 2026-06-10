type LabelerAbilityAssignment = {
  assignmentId: number
  taskTitle: string
  total: number
  completed: number
  reviewPassed: number
  needsRevision: number
}

export function safePercent(value: number, total: number) {
  if (total <= 0) {
    return 0
  }
  return Math.round((value / total) * 100)
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function formatPercent(value: number) {
  return `${clampPercent(value)}%`
}

export function calculateLabelerAbility<T extends LabelerAbilityAssignment>(assignments: T[]) {
  const reviewPassedCount = assignments.reduce((sum, assignment) => sum + assignment.reviewPassed, 0)
  const needsRevisionCount = assignments.reduce((sum, assignment) => sum + assignment.needsRevision, 0)
  const submittedCount = assignments.reduce(
    (sum, assignment) => sum + Math.max(assignment.completed - assignment.reviewPassed - assignment.needsRevision, 0),
    0,
  )

  const evaluatedCount = reviewPassedCount + needsRevisionCount
  const processedCount = submittedCount + evaluatedCount
  const totalItems = assignments.reduce((sum, assignment) => sum + assignment.total, 0)
  const completedItems = assignments.reduce((sum, assignment) => sum + assignment.completed, 0)
  const passRate = safePercent(reviewPassedCount, evaluatedCount)
  const revisionRate = safePercent(needsRevisionCount, evaluatedCount)
  const completionRate = safePercent(completedItems, totalItems)
  const pendingReviewRate = safePercent(submittedCount, processedCount)
  const qualityScore = clampPercent(passRate * 0.58 + completionRate * 0.24 + (100 - revisionRate) * 0.18)
  const consistencyScore = clampPercent(100 - revisionRate)

  const taskPerformance = assignments
    .map((assignment) => {
      const pendingReview = Math.max(assignment.completed - assignment.reviewPassed - assignment.needsRevision, 0)
      const evaluated = assignment.reviewPassed + assignment.needsRevision
      return {
        assignment,
        completionRate: safePercent(assignment.completed, assignment.total),
        passRate: safePercent(assignment.reviewPassed, evaluated),
        revisionRate: safePercent(assignment.needsRevision, evaluated),
        pendingReview,
      }
    })
    .sort((left, right) => right.completionRate - left.completionRate || right.passRate - left.passRate)
    .slice(0, 6)

  return {
    evaluatedCount,
    processedCount,
    totalItems,
    completedItems,
    passRate,
    revisionRate,
    completionRate,
    pendingReviewRate,
    qualityScore,
    consistencyScore,
    taskPerformance,
    reviewPassedCount,
    needsRevisionCount,
    submittedCount,
    claimedTaskCount: assignments.length,
  }
}
