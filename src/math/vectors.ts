export function zeros(dim: number): Float64Array {
  return new Float64Array(dim)
}

export function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

export function normalize(v: Float64Array): Float64Array {
  const mag = Math.sqrt(dot(v, v))
  if (mag === 0) return new Float64Array(v.length)
  const result = new Float64Array(v.length)
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / mag
  }
  return result
}

export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  const magA = Math.sqrt(dot(a, a))
  const magB = Math.sqrt(dot(b, b))
  if (magA === 0 || magB === 0) return 0
  return dot(a, b) / (magA * magB)
}

export function add(a: Float64Array, b: Float64Array): Float64Array {
  const result = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] + b[i]
  }
  return result
}

export function scale(v: Float64Array, s: number): Float64Array {
  const result = new Float64Array(v.length)
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] * s
  }
  return result
}

export function randomUnitVector(dim: number): Float64Array {
  const v = new Float64Array(dim)
  for (let i = 0; i < dim; i++) {
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random()
    const u2 = Math.random()
    v[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
  return normalize(v)
}

export function randomProjectionMatrix(
  outputDim: number,
  inputDim: number,
): Float64Array[] {
  const matrix: Float64Array[] = []
  for (let i = 0; i < outputDim; i++) {
    matrix.push(randomUnitVector(inputDim))
  }
  return matrix
}

export function project(
  matrix: Float64Array[],
  v: Float64Array,
): Float64Array {
  const result = new Float64Array(matrix.length)
  for (let i = 0; i < matrix.length; i++) {
    result[i] = dot(matrix[i], v)
  }
  return result
}
