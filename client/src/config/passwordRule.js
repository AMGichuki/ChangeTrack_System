// The same password rule as the server (authController.checkPasswordRule),
// checked in the browser first so the Admin gets a quick message.
// The server still checks again, because browser code can be changed.
export function checkNewPassword(password, confirm) {
  if (password.length < 8) return 'The password must have at least 8 characters.'
  if (password.length > 72) return 'Use 72 characters or fewer.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

export const EMPTY_PASSWORD = { password: '', confirm: '' }
