// FOR TESTING ONLY.
// seed.sql creates EVIDENCE rows for the sample requests, but not the files
// themselves. This script makes a small, clearly-labelled sample PDF for every
// evidence row whose file is missing from the private Storage bucket.
// Run with:  npm run sample-evidence   (safe to run again)
require('dotenv').config({ quiet: true });
const PDFDocument = require('pdfkit');
const db = require('../config/db');
const { supabase, EVIDENCE_BUCKET } = require('../config/supabase');

function samplePdf(fileName, requestNumber) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fillColor('#b42318').font('Helvetica-Bold').fontSize(22).text('SAMPLE - TEST DATA');
    doc.moveDown();
    doc.fillColor('#1c2b45').font('Helvetica').fontSize(12)
      .text(`This is a placeholder evidence file for ${requestNumber}.`)
      .text(`File name: ${fileName}`)
      .moveDown()
      .text('It was created by the ChangeTrack test-data script and is not a real document.');
    doc.end();
  });
}

async function fileExists(path) {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await supabase.storage.from(EVIDENCE_BUCKET).list(folder, { search: name });
  return (data || []).some((f) => f.name === name);
}

async function main() {
  const { rows } = await db.query(
    `SELECT e.file_name, e.file_path, r.request_number
       FROM evidence e JOIN requests r ON r.id = e.request_id
      ORDER BY e.id`
  );
  let made = 0;
  for (const row of rows) {
    if (await fileExists(row.file_path)) continue;
    const pdf = await samplePdf(row.file_name, row.request_number);
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET)
      .upload(row.file_path, pdf, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(`${row.file_path}: ${error.message}`);
    console.log(`  made sample file for ${row.request_number}: ${row.file_name}`);
    made++;
  }
  console.log(made ? `Done. ${made} sample file(s) uploaded.` : 'All evidence files already exist. Nothing to do.');
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
