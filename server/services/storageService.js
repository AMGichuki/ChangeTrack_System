// Saves and removes evidence files in the PRIVATE Supabase Storage bucket.
const crypto = require('crypto');
const { supabase, EVIDENCE_BUCKET } = require('../config/supabase');
const { EVIDENCE } = require('../config/rules');

// Make a file name safe for storage: keep letters, numbers, dot, dash, underscore.
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

// Upload one file. Returns the path where it was stored.
async function uploadEvidenceFile(requestId, file) {
  const ext = EVIDENCE.types.find((t) => file.originalname.toLowerCase().endsWith(t.ext));
  // A random part stops two files with the same name overwriting each other.
  const path = `requests/${requestId}/${crypto.randomUUID()}-${safeName(file.originalname)}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file.buffer, {
    contentType: ext.mime,
    upsert: false,
  });
  if (error) throw new Error('Evidence upload failed: ' + error.message);
  return path;
}

// Remove files (used to clean up if saving the request fails).
async function removeEvidenceFiles(paths) {
  if (paths.length === 0) return;
  await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
}

// A private file cannot be opened by a normal link. After our server has checked
// that the person may see it, we create a SIGNED link that works for 60 seconds only.
async function createViewLink(path) {
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60);
  if (error) throw new Error('Could not open the file: ' + error.message);
  return data.signedUrl;
}

module.exports = { uploadEvidenceFile, removeEvidenceFiles, createViewLink };
