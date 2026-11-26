// Receives evidence files from the New request form (multipart/form-data).
// Files are kept in memory only until we check them and send them to
// the private Supabase Storage bucket. Nothing is saved on our server's disk.
const multer = require('multer');
const { EVIDENCE } = require('../config/rules');

const receiveEvidence = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: EVIDENCE.maxFiles,
    fileSize: EVIDENCE.maxSizeMb * 1024 * 1024,
    fields: 20,
  },
}).array('evidence', EVIDENCE.maxFiles);

// Wraps multer so its errors become friendly 400 messages.
function uploadEvidence(req, res, next) {
  receiveEvidence(req, res, (err) => {
    if (!err) return next();
    let message = 'The files could not be uploaded.';
    if (err.code === 'LIMIT_FILE_SIZE') message = `Each file must be ${EVIDENCE.maxSizeMb} MB or smaller.`;
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `You can attach up to ${EVIDENCE.maxFiles} files.`;
    }
    res.status(400).json({ status: 'error', message });
  });
}

// All files in one submission together must fit in EVIDENCE.maxTotalMb.
function checkTotalSize(files) {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > EVIDENCE.maxTotalMb * 1024 * 1024) {
    return `The files are too big together. Attach at most ${EVIDENCE.maxTotalMb} MB in total (compress large scans).`;
  }
  return null;
}

// Is this file really a PDF / JPG / PNG? Checks the extension AND the first bytes.
function checkEvidenceFile(file) {
  const name = file.originalname.toLowerCase();
  const type = EVIDENCE.types.find((t) => name.endsWith(t.ext));
  if (!type) return `"${file.originalname}" is not allowed. Use PDF, JPG or PNG.`;
  const looksRight = type.magic.every((byte, i) => file.buffer[i] === byte);
  if (!looksRight) return `"${file.originalname}" is not a real ${type.ext.slice(1).toUpperCase()} file.`;
  return null;
}

module.exports = { uploadEvidence, checkEvidenceFile, checkTotalSize };
