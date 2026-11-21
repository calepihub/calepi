import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));

test('firestore.rules enforces global default-deny and verified email auth', () => {
  assert.match(rulesText, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth != null && request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /isValidId\(id\)/);
});

test('firestore.rules enforces strict list, create, update, and subcollection ownership', () => {
  assert.match(rulesText, /allow list: if false;/);
  assert.match(rulesText, /allow list: if isSignedIn\(\)\s*&& existing\(\)\.ownerId == request\.auth\.uid;/);
  assert.match(rulesText, /allow update: if isSignedIn\(\)\s*&& isValidId\(projectId\)\s*&& isValidProject\(incoming\(\), projectId\)/);
  assert.match(rulesText, /incoming\(\)\.ownerId == existing\(\)\.ownerId/);
  assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesText, /exists\(\/databases\/\$\(database\)\/documents\/projects\/\$\(projectId\)\)/);
});

test('firebase-blueprint.json required ProjectRecord fields match isValidProject allowlist', () => {
  const required = blueprint.entities.ProjectRecord.required;
  for (const field of required) {
    assert.ok(
      rulesText.includes(`'${field}'`),
      `Field ${field} missing in firestore.rules validation`,
    );
  }
  assert.ok(!required.includes('capturedRenders'), 'capturedRenders must live in subcollection');
});
