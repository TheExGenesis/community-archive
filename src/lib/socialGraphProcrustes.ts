export interface GraphPosition {
  x: number
  y: number
}

type GraphPositions = Record<string, GraphPosition>

interface SimilarityTransform {
  scale: number
  cos: number
  sin: number
  reflectY: boolean
  candidateCenter: GraphPosition
  referenceCenter: GraphPosition
}

const center = (positions: GraphPositions, ids: string[]): GraphPosition => {
  const total = ids.reduce(
    (sum, id) => ({
      x: sum.x + positions[id].x,
      y: sum.y + positions[id].y,
    }),
    { x: 0, y: 0 },
  )
  return { x: total.x / ids.length, y: total.y / ids.length }
}

function fitTransform(
  reference: GraphPositions,
  candidate: GraphPositions,
  ids: string[],
  reflectY: boolean,
): SimilarityTransform {
  const referenceCenter = center(reference, ids)
  const candidateCenter = center(candidate, ids)
  let dot = 0
  let cross = 0
  let candidateEnergy = 0

  for (const id of ids) {
    const candidateX = candidate[id].x - candidateCenter.x
    const rawCandidateY = candidate[id].y - candidateCenter.y
    const candidateY = reflectY ? -rawCandidateY : rawCandidateY
    const referenceX = reference[id].x - referenceCenter.x
    const referenceY = reference[id].y - referenceCenter.y
    dot += candidateX * referenceX + candidateY * referenceY
    cross += candidateX * referenceY - candidateY * referenceX
    candidateEnergy += candidateX ** 2 + candidateY ** 2
  }

  const magnitude = Math.hypot(dot, cross)
  return {
    scale: candidateEnergy > 0 ? magnitude / candidateEnergy : 1,
    cos: magnitude > 0 ? dot / magnitude : 1,
    sin: magnitude > 0 ? cross / magnitude : 0,
    reflectY,
    candidateCenter,
    referenceCenter,
  }
}

function applyTransform(
  point: GraphPosition,
  transform: SimilarityTransform,
): GraphPosition {
  const centeredX = point.x - transform.candidateCenter.x
  const rawCenteredY = point.y - transform.candidateCenter.y
  const centeredY = transform.reflectY ? -rawCenteredY : rawCenteredY
  return {
    x:
      transform.referenceCenter.x +
      transform.scale *
        (transform.cos * centeredX - transform.sin * centeredY),
    y:
      transform.referenceCenter.y +
      transform.scale *
        (transform.sin * centeredX + transform.cos * centeredY),
  }
}

const squaredError = (
  reference: GraphPositions,
  candidate: GraphPositions,
  ids: string[],
  transform: SimilarityTransform,
) =>
  ids.reduce((total, id) => {
    const aligned = applyTransform(candidate[id], transform)
    return (
      total +
      (aligned.x - reference[id].x) ** 2 +
      (aligned.y - reference[id].y) ** 2
    )
  }, 0)

/**
 * Align a fresh graph layout to the last visible one with a 2D similarity
 * Procrustes transform. Rotation, reflection, scale, and translation are
 * removed while the internal shape of the new layout is preserved.
 */
export function alignGraphLayout(
  reference: GraphPositions,
  candidate: GraphPositions,
): GraphPositions {
  const sharedIds = Object.keys(candidate).filter((id) => reference[id])
  if (sharedIds.length === 0) return candidate

  if (sharedIds.length === 1) {
    const id = sharedIds[0]
    const offsetX = reference[id].x - candidate[id].x
    const offsetY = reference[id].y - candidate[id].y
    return Object.fromEntries(
      Object.entries(candidate).map(([candidateId, point]) => [
        candidateId,
        { x: point.x + offsetX, y: point.y + offsetY },
      ]),
    )
  }

  const direct = fitTransform(reference, candidate, sharedIds, false)
  const reflected = fitTransform(reference, candidate, sharedIds, true)
  const transform =
    squaredError(reference, candidate, sharedIds, reflected) <
    squaredError(reference, candidate, sharedIds, direct)
      ? reflected
      : direct

  return Object.fromEntries(
    Object.entries(candidate).map(([id, point]) => [
      id,
      applyTransform(point, transform),
    ]),
  )
}
