import stripAnsi from 'strip-ansi'

/**
 * Extracts and parses the first valid JSON value (object or array) from kongctl CLI output.
 * Removes ANSI codes and non-printable characters, then finds the first JSON root.
 * Throws if no valid JSON is found or parsing fails.
 * @param rawOutput Raw stdout from kongctl
 * @returns Parsed JSON value (object or array)
 */
export function parseKongctlJsonOutput(rawOutput: string): any {
  let cleanStdout = stripAnsi(rawOutput.trim())
  // Remove ANSI escape codes and all non-printable control characters except standard whitespace
  cleanStdout = cleanStdout.replace(/[^\n\t\x20-\x7E]/g, '').trim()

  // Regex to match the first JSON object or array in the output
  const jsonRegex = /([[{][\s\S]*[\]}])/m
  const match = cleanStdout.match(jsonRegex)
  if (!match) {
    throw new Error(`No valid JSON value found in kongctl output: '${cleanStdout}'`)
  }
  const jsonString = match[1]
  try {
    return JSON.parse(jsonString)
  } catch (parseError) {
    throw new Error(`Failed to parse kongctl response: ${parseError} ,'${jsonString}'`)
  }
}
