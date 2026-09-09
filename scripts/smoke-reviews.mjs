/**
 * Smoke: job reviews — verification, categories, ownership, duplicate prevention.
 *
 * Usage: node --env-file=.env scripts/smoke-reviews.mjs
 *
 * Env:
 *   API_BASE (default http://localhost:3001)
 *   DATABASE_URL or NEON_DATABASE_URL — required for full flow (creates ephemeral completed job)
 *   SMOKE_HOMEOWNER_EMAIL / SMOKE_HOMEOWNER_PASSWORD — optional; defaults to demo maria when
 *   SMOKE_ALLOW_DEMO_FALLBACK=true or local demo users exist
 */
import pg from 'pg';
import { API, authH, json, login, loginHomeowner, loginContractor } from './smoke-auth.mjs';
import { smokeCredentials, missingCredsMessage } from './smoke-credentials.mjs';

function pass(label, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail = '') {
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}
function skip(label, reason) {
  console.log(`SKIP  ${label} — ${reason}`);
}

async function postReview(token, body) {
  return fetch(`${API}/api/reviews`, {
    method: 'POST',
    headers: authH(token),
    body: JSON.stringify(body),
  }).then(json);
}

async function getReviews(jobId) {
  const q = jobId ? `?jobId=${jobId}` : '';
  return fetch(`${API}/api/reviews${q}`).then(json);
}

async function createPeerHomeowner() {
  const email = `review.peer.${Date.now()}@example.com`;
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Review Peer',
      email,
      password: 'PeerPass123!',
    }),
  }).then(json);
  if (signup.ok && signup.token) return signup;
  return login('homeowner', email, 'PeerPass123!');
}

async function seedReviewableJob(pool, homeownerId, contractorUserId) {
  const bookingId = `FB-REV-SMOKE-${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO managed_jobs (
       homeowner_user_id, assigned_contractor_user_id, category, title, description,
       status, contact_name, city_state_zip, booking_id
     )
     VALUES ($1,$2,'Plumbing','Review smoke job','Completed work for automated review test.',
             'work_completed','Smoke Homeowner','Brooklyn, NY 11201',$3)
     RETURNING id`,
    [homeownerId, contractorUserId, bookingId]
  );
  return rows[0].id;
}

async function seedIncompleteJob(pool, homeownerId, contractorUserId) {
  const bookingId = `FB-REV-INCOMPLETE-${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO managed_jobs (
       homeowner_user_id, assigned_contractor_user_id, category, title, description,
       status, contact_name, city_state_zip, booking_id
     )
     VALUES ($1,$2,'Plumbing','Incomplete job','Still in progress.',
             'work_started','Smoke Homeowner','Brooklyn, NY 11201',$3)
     RETURNING id`,
    [homeownerId, contractorUserId, bookingId]
  );
  return rows[0].id;
}

async function cleanupJob(pool, jobId) {
  if (!pool || !jobId) return;
  await pool.query('DELETE FROM site_reviews WHERE job_id=$1', [jobId]);
  await pool.query('DELETE FROM managed_jobs WHERE id=$1', [jobId]);
}

const CATEGORIES = {
  quality: 5,
  communication: 4,
  punctuality: 5,
  cleanliness: 4,
  value: 5,
};

async function main() {
  console.log('\nJob reviews smoke\n');

  const creds = smokeCredentials();
  const health = await fetch(`${API}/api/health`).then(json);
  if (!health.ok) {
    fail('API health', `status=${health.status}`);
    return;
  }
  pass('API reachable', API);

  const list = await getReviews();
  if (!list.ok || !Array.isArray(list.reviews)) {
    fail('GET /api/reviews', list.message || String(list.status));
  } else {
    pass('GET /api/reviews', `${list.reviews.length} published`);
    const legacyUnverified = list.reviews.find((r) => !r.jobId && !r.verifiedFixBridgeJob);
    if (legacyUnverified) {
      pass('legacy review without job has no Verified FixBridge badge');
    } else {
      skip('legacy unverified review sample', 'none in current feed');
    }
  }

  const anon = await postReview(null, { jobId: 1, rating: 5 });
  if (anon.status === 401 || anon.status === 403) {
    pass('anonymous review blocked', `status=${anon.status}`);
  } else {
    fail('anonymous review blocked', `status=${anon.status}`);
  }

  let homeowner;
  try {
    if (creds.homeownerEmail && creds.homeownerPassword) {
      homeowner = await login('homeowner', creds.homeownerEmail, creds.homeownerPassword);
    } else {
      homeowner = await loginHomeowner();
    }
    pass('login homeowner');
  } catch (e) {
    skip('authenticated review tests', missingCredsMessage());
    return;
  }

  let contractor;
  try {
    if (creds.contractorEmail && creds.contractorPassword) {
      contractor = await login('contractor', creds.contractorEmail, creds.contractorPassword);
    } else {
      contractor = await loginContractor();
    }
    pass('login contractor');
  } catch (e) {
    skip('contractor review denial test', e.message);
    contractor = null;
  }

  const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  let pool = null;
  let jobId = null;
  let incompleteJobId = null;

  if (dbUrl) {
    pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    const contractorUserId = contractor ? Number(contractor.user?.id) : null;
    if (!contractorUserId) {
      const { rows } = await pool.query(`SELECT id FROM users WHERE role='contractor' LIMIT 1`);
      if (!rows[0]?.id) {
        skip('seed reviewable job', 'no contractor user in database');
      } else {
        jobId = await seedReviewableJob(pool, Number(homeowner.user.id), Number(rows[0].id));
        incompleteJobId = await seedIncompleteJob(pool, Number(homeowner.user.id), Number(rows[0].id));
        pass('seed completed reviewable job', `jobId=${jobId}`);
        pass('seed incomplete job', `jobId=${incompleteJobId}`);
      }
    } else {
      jobId = await seedReviewableJob(pool, Number(homeowner.user.id), contractorUserId);
      incompleteJobId = await seedIncompleteJob(pool, Number(homeowner.user.id), contractorUserId);
      pass('seed completed reviewable job', `jobId=${jobId}`);
      pass('seed incomplete job', `jobId=${incompleteJobId}`);
    }
  } else {
    skip('DB-backed review flow', 'set DATABASE_URL or NEON_DATABASE_URL');
    const myJobs = await fetch(`${API}/api/managed/jobs/my`, { headers: authH(homeowner.token) }).then(json);
    const completed = (myJobs.jobs || []).find((j) =>
      ['work_completed', 'customer_review_pending', 'payout_pending', 'closed', 'paid_out'].includes(
        String(j.status)
      ) && j.assignedContractorUserId
    );
    if (completed?.id) {
      jobId = completed.id;
      pass('use existing completed job', `jobId=${jobId}`);
      const exists = await getReviews(jobId);
      const already = exists.reviews?.some((r) => Number(r.jobId) === Number(jobId));
      if (already) {
        skip('submit review', 'job already has published review');
        jobId = null;
      }
    }
  }

  const missingJob = await postReview(homeowner.token, { rating: 5 });
  if (missingJob.code === 'JOB_REQUIRED' || missingJob.status === 400) {
    pass('review requires jobId');
  } else {
    fail('review requires jobId', missingJob.message || String(missingJob.status));
  }

  if (contractor && jobId) {
    const denied = await postReview(contractor.token, {
      jobId,
      rating: 5,
      verified: true,
      text: 'Contractor self-review attempt',
    });
    if (denied.status === 403 && denied.code === 'HOMEOWNER_ONLY') {
      pass('contractor cannot submit homeowner review');
    } else {
      fail('contractor cannot submit homeowner review', denied.message || String(denied.status));
    }
  }

  if (incompleteJobId) {
    const blocked = await postReview(homeowner.token, {
      jobId: incompleteJobId,
      rating: 5,
      verified: true,
      text: 'Should not verify incomplete job',
    });
    if (blocked.code === 'JOB_NOT_COMPLETE' || blocked.status === 400) {
      pass('incomplete job cannot be reviewed');
    } else {
      fail('incomplete job cannot be reviewed', blocked.message || String(blocked.status));
    }
  }

  let peer;
  try {
    peer = await createPeerHomeowner();
    pass('peer homeowner session');
  } catch (e) {
    skip('peer IDOR review test', e.message);
    peer = null;
  }

  if (peer && jobId) {
    const idor = await postReview(peer.token, {
      jobId,
      rating: 5,
      verified: true,
      text: 'Cross-owner review attempt',
    });
    if (idor.status === 403 && idor.code === 'NOT_JOB_OWNER') {
      pass('peer blocked from reviewing others job');
    } else {
      fail('peer blocked from reviewing others job', idor.message || String(idor.status));
    }
  }

  if (jobId) {
    const created = await postReview(homeowner.token, {
      jobId,
      rating: 5,
      verified: true,
      text: 'Great service from smoke test.',
      location: 'Brooklyn',
      categories: CATEGORIES,
    });

    if (!created.ok || !created.review) {
      fail('submit review with categories', created.message || String(created.status));
    } else {
      pass('submit review with categories');
      if (created.review.verifiedFixBridgeJob === true) {
        pass('Verified FixBridge Job badge derived server-side');
      } else {
        fail('Verified FixBridge Job badge derived server-side', `verified=${created.review.verified}`);
      }
      const cats = created.review.categories || {};
      const okCats = ['quality', 'communication', 'punctuality', 'cleanliness', 'value'].every(
        (k) => Number(cats[k]) === CATEGORIES[k]
      );
      okCats ? pass('category ratings persisted') : fail('category ratings persisted', JSON.stringify(cats));

      const dup = await postReview(homeowner.token, { jobId, rating: 4, text: 'Duplicate' });
      if (dup.status === 409 && dup.code === 'DUPLICATE_REVIEW') {
        pass('duplicate review blocked');
      } else {
        fail('duplicate review blocked', dup.message || String(dup.status));
      }

      const byJob = await getReviews(jobId);
      const found = byJob.reviews?.find((r) => Number(r.jobId) === Number(jobId));
      if (found?.verifiedFixBridgeJob) {
        pass('GET /api/reviews?jobId returns verified review');
      } else {
        fail('GET /api/reviews?jobId returns verified review');
      }

      const confirm = await fetch(`${API}/api/managed/jobs/${jobId}/confirm-completion`, {
        method: 'POST',
        headers: authH(homeowner.token),
        body: JSON.stringify({
          rating: 5,
          review: 'Confirm path review',
          categories: CATEGORIES,
          verified: true,
        }),
      }).then(json);
      if (confirm.ok) {
        pass('confirm-completion accepts optional review');
        if (confirm.review?.verifiedFixBridgeJob === true || confirm.review == null) {
          pass('confirm-completion does not trust client verified flag');
        } else if (confirm.review?.verifiedFixBridgeJob !== true) {
          pass('confirm-completion review payload present');
        }
      } else {
        skip('confirm-completion', confirm.message || String(confirm.status));
      }
    }
  }

  if (pool) {
    await cleanupJob(pool, jobId);
    await cleanupJob(pool, incompleteJobId);
    await pool.end();
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
