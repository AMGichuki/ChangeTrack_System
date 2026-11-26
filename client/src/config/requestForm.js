// Helpers shared by the New request and Correct returned request pages.

export const EMPTY_REQUEST_FORM = {
  department_id: '', // the department the request is FOR (its Chair and Dean decide)
  student_number: '',
  course_code: '',
  section: '',
  term: '',
  current_grade: '',
  new_grade: '',
  reason: '',
  justification: '',
}

// Same file checks as the server, so the lecturer gets quick feedback.
// Returns an error message, or null if all files are fine.
// newFilesBytes = size of ALL new files that will be sent together (already chosen + these).
export function checkChosenFiles(chosen, totalAfter, options, newFilesBytes = 0) {
  const { maxFiles, maxSizeMb, maxTotalMb } = options.evidence
  for (const file of chosen) {
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return `"${file.name}" is not allowed. Use PDF, JPG or PNG.`
    if (file.size > maxSizeMb * 1024 * 1024) return `"${file.name}" is bigger than ${maxSizeMb} MB.`
  }
  if (totalAfter > maxFiles) return `A request can have up to ${maxFiles} files in total.`
  if (maxTotalMb && newFilesBytes > maxTotalMb * 1024 * 1024) {
    return `The files are too big together. Attach at most ${maxTotalMb} MB in total (compress large scans).`
  }
  return null
}
