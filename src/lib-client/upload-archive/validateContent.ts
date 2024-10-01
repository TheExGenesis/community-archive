export const validateContent = (content: string, expectedSchema: any) => {
  console.log('Validating content...', content.split('\n')[0])
  const dataJson = content.slice(content.indexOf('['))
  let data
  try {
    data = JSON.parse(dataJson)
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return false
  }

  if (!Array.isArray(data)) {
    console.error('Data is not an array')
    return false
  }

  return data.every((item) => {
    if (typeof item !== 'object' || item === null) {
      console.error('Item is not an object:', item)
      return false
    }
    return Object.keys(expectedSchema).every((key) => key in item)
  })
}
