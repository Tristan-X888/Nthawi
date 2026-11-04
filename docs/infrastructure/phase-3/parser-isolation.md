# P3-D10: hostile-document isolation decision

Part of the [Phase 3 design bundle](README.md). Trace: D-20, D-22; AC-06,
AC-30. Owners: **P** Shane Viyazhi (primary), **B** Sherise Viyazhi (backup).

Status: **architecture approved by the owner (P3-U02)**: a dedicated Linux VM
per environment, with one fresh gVisor sandbox per document attempt. The
owner approved the VM + gVisor architecture. DigitalOcean Frankfurt, 2 vCPU /
4 GiB, USD 24 per month public price (DO-01), is an engineering proposal,
subject to a quote and the preflight below; the owner did not select a vendor
or authorize a purchase. The
numerical bounds are **selected design values, unvalidated until Phase 9**. No
parser, sandbox or hostile fixture was run in Phase 3. Evidence IDs refer to
the [data and isolation evidence](../../sources/phase-3-data-isolation-research-2026-11-04.md).

## Why Render is not the parser runtime

The Render documentation read (RDR-01 to RDR-12) describes topology:
same-region private networking, services without public URLs, outbound-only
workers. It documents no per-job egress denial, no customer-selected OCI
runtime, no read-only root enforcement and no per-job resource or teardown
control. A private network or a separate container is topology, not a
hostile-document sandbox. Render keeps the API, jobs worker, scanner and
recovery job; only parsing moves.

| Alternative                                  | Disposition                         | Reason                                                                                                                                                                                                                                              |
| -------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary Render container or private service | Rejected                            | No documented enforcement path for egress, filesystem, process or per-job teardown.                                                                                                                                                                 |
| Dedicated VM with gVisor per job             | **Selected (P3-U02)**               | Every control below has a documented host-side mechanism (GV-01 to GV-04) and can be inspected. Costs: P patches and monitors the host, two concurrent jobs share one host kernel, and an mTLS endpoint is exposed to the internet.                 |
| Cloudflare Containers, microVM per job       | Evaluated alternative, not selected | GA, with a microVM per instance, egress blocking and ephemeral disk (CFC-01), and lower operations. Coarser sizing, and process limits must be enforced in-guest. It becomes the fallback if the VM preflight fails, which needs an owner decision. |
| Self-managed Firecracker microVM per job     | Not selected                        | Strongest separation on owned infrastructure, but the most operational work for a two-person team.                                                                                                                                                  |

## Architecture

- **Host.** One VM per environment (staging and production), used only for
  parsing: no database, storage, auth, payment or AI credential and no other
  workload. It runs a current long-term-support Linux image with systemd 244
  or later and cgroup v2 (GV-04), confirmed in the preflight. Host job
  directories live on host tmpfs. Host swap and hibernation are disabled;
  persistent core dumps are disabled for the agent, runsc and gofer as well as
  guest processes. No document bytes or extracted text enter logs. These host
  controls are required for the claim that document bytes never reach host disk;
  a sandbox-only swap limit does not protect the agent's buffers.
- **Runtime.** A pinned `runsc` release with checksum verification; the
  default platform, so no nested virtualization is needed. Flags:
  `--network=none` (GV-01), `--directfs=false` (GV-02, stricter seccomp),
  `--overlay2=root:memory,size=128m` (GV-02: writes go to a bounded in-memory
  upper layer over a read-only image), and `--systemd-cgroup` (GV-04).
- **Invocation.** A trusted control agent creates a fresh OCI bundle per
  attempt from the digest-verified, read-only parser root filesystem and runs
  `runsc` directly. There is no Docker daemon or socket on the host. Phase 9
  may substitute containerd only with equivalent evidence.
- **Slots.** Two concurrent sandboxes per VM, giving two global parse slots at
  launch. Each attempt gets a new sandbox, bundle and cgroup scope.

## Control interface (`parse-v1`)

The jobs worker calls `POST /v1/parse` on the VM's public IP, port 443, using
**mutual TLS**. An environment-specific private CA issues the worker's client
certificate and the agent's server certificate, named
`parser-control.{environment}.nthawi.internal`; that name is never published in
DNS. The provider firewall admits port 443 only from Render Frankfurt's
outbound ranges (RDR-07). Those ranges are shared with other Render customers,
so this is defense in depth; mTLS is the authentication. SSH is closed;
break-glass uses the provider console, which B can open independently.

**Request.** Headers carry job ID, attempt fencing generation, opaque owner,
workspace, source and revision IDs, format, policy version, selected content
(worksheets, hidden-content and speaker-notes opt-ins), expected SHA-256 and
byte length, absolute deadline and a nonce. The body is the scanned bytes, at
most 10,485,760. The agent rejects stale (over 60 seconds) or repeated nonces,
then verifies length and hash before launching anything. It accepts no URL,
path, archive destination, command or image from the request.

**Response.** Job ID, fencing generation and input hash echoed; parser image
digest, `runsc` version and policy version; a terminal status (`succeeded`,
`rejected:<code>` or `failed:<code>`); ordered blocks with page, paragraph,
sheet, cell or slide provenance; warnings and omitted-content records; counters
(pages, slides, sheets, cells, blocks, bytes, peak memory, duration); and an
output hash. The agent validates schema, sizes, counts, UTF-8 and identity
before replying, and the worker validates again and checks the fencing
generation before recording anything. Extracted text is untrusted data: never
an instruction, executable HTML or SQL.

## Enforcement matrix

| Requirement            | Control (host-enforced unless stated)                                                                                                                                                     | Evidence basis | Phase 9 proof required                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Egress and DNS         | `--network=none`: only an in-sandbox loopback exists. The host firewall separately limits host egress to DNS, time, OS mirrors and the image registry.                                    | GV-01          | From inside the sandbox, DNS, IPv4, IPv6, host, private, link-local and metadata addresses and external callbacks all fail; packet capture outside the sandbox shows nothing. |
| Filesystem and scratch | Read-only image under a 128 MiB memory-backed overlay; input is a single read-only bind mount; directfs off; no host paths, devices, sockets or credentials.                              | GV-02          | Attempts on host and cross-job paths, symlink and traversal tricks, writing past 128 MiB, and anything persisting after teardown all fail.                                    |
| Processes              | Non-root UID; no capabilities; `noNewPrivileges`; OCI rlimits `NPROC` 64, `NOFILE` 128, `FSIZE` 16 MiB, `CORE` 0; host `TasksMax` 128 bounds runtime threads.                             | GV-03, GV-04   | Fork and thread bombs stop at the limit. Guest processes are not host processes (GV-03), so host PID limits alone prove nothing.                                              |
| CPU                    | Host cgroup `CPUQuota=100%` (one vCPU) per sandbox.                                                                                                                                       | GV-04          | A CPU burn cannot slow the other slot beyond its own quota.                                                                                                                   |
| Memory                 | Host cgroup `MemoryMax=512M` and swap 0 for the whole sandbox, including Sentry, gofer and the memory-backed overlay (GV-03).                                                             | GV-03, GV-04   | Allocation and overlay bombs end in a clean OOM rejection; the host and the other slot are unaffected.                                                                        |
| Wall time              | Host monotonic watchdog: 30 seconds of parsing, then the whole sandbox is killed and deleted within a 10-second teardown budget. The worker's deadline is separate.                       | Design         | Infinite loops, stalled I/O, ignored signals and orphaned children all end; nothing survives an agent restart.                                                                |
| Output size            | Output travels on stdout, capped at 16 MiB plus one byte; stderr capped at 64 KiB of codes only. Overflow kills the sandbox and rejects the job.                                          | Design         | Output floods on every channel are rejected without truncation or a partial result.                                                                                           |
| Credentials            | The sandbox environment is empty apart from fixed locale and time zone. The agent holds only its mTLS key and CA certificates.                                                            | Design         | Canary secrets planted on the host are unreadable from the sandbox; the agent's environment and mounts are inspected.                                                         |
| Teardown               | `runsc delete --force`, bundle removed, cgroup and process absence verified; a failed cleanup quarantines the slot and drains the host for rebuild.                                       | Design         | Timeouts, OOMs, cancellations and host crashes leave no task, mount or content behind, and no cross-job reads.                                                                |
| Image provenance       | Parser image built in CI from reviewed source on a digest-pinned base, with SBOM and vulnerability scan; pulled by digest; `runsc` checksum-verified; every result records both versions. | Design         | Digest and attestation are verified outside the sandbox; a denylisted digest is refused.                                                                                      |

Host controls hold even if parser code is compromised; no limit relies on the
parser obeying it. Patching: OS security updates install automatically, with a
weekly reboot window. `runsc` and parser images are reviewed monthly and
immediately after a critical advisory, and the full fixture corpus re-runs
before a new version takes customer input. A compromised agent stays inside the
parser plane: rotate its identity, rebuild the host from configuration, and
remember that the host never held a production credential.

## Extraction contract

These are the approved D-20 rules, unchanged. Only `.md`, `.txt`, text-bearing
`.pdf`, `.docx`, `.xlsx` and `.pptx` are accepted. CSV, legacy or macro-enabled
Office formats, OCR and executable processing are not added. Content inspection
must agree with a supported format; the extension alone is insufficient.
Encrypted, password-protected, malformed, binary or non-UTF-8 inputs are
rejected with a stable reason.

| Format         | Behavior                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown, text | Valid UTF-8 only. Headings, lists and code kept as text. No script execution or remote includes; embedded HTML rendered inert. English and Chichewa characters, including diacritics, are preserved.                       |
| PDF            | Text layer only, with page provenance; no OCR. Image-only PDFs are rejected. Mixed PDFs list the omitted pages and need the owner's explicit acknowledgement before publication.                                           |
| DOCX           | Paragraphs, headings and tables. No macros, external templates, external relationships or embedded executables are processed. Hidden material needs explicit opt-in during review.                                         |
| XLSX           | Visible selected worksheets by default; literal values, with cached formula results labelled; no recalculation or external refresh. Hidden sheets or cells need explicit opt-in. Content is knowledge, not live inventory. |
| PPTX           | Visible slide text and tables. Hidden slides and speaker notes are excluded unless explicitly included during review; no macros or external fetches.                                                                       |

XML parsing disables DTDs, external entities and external resolution. ZIP
entries are enumerated safely before extraction. Sizes are checked while
decompressing rather than trusting headers, and actual cumulative expansion is
tracked.

## Numerical bounds

The original-file maximum is approved; everything else is a selected design
value against the unapproved D-22 candidates. A value becomes launch policy
only after Phase 9 shows representative valid files succeed and hostile files
fail safely. Every bound applies independently, so a file can be under the
upload limit and still be rejected.

| Dimension                     | Selected value                                                | D-22 candidate | Rationale                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original file                 | 10,485,760 bytes                                              | (approved)     | Approved allowance; enforced on actual streamed bytes.                                                                                                        |
| Expanded archive content      | 52,428,800 bytes                                              | 50 MiB         | Bounds decompression independently of file size.                                                                                                              |
| Archive members               | 2,000                                                         | 2,000          | Bounds per-entry work, including many tiny entries.                                                                                                           |
| Expansion ratio               | 100:1 per member and cumulative                               | 100:1          | Catches small compressed bombs before the absolute cap.                                                                                                       |
| PDF pages / slides            | 200 / 100                                                     | 200 / 100      | Bounds provenance and review work.                                                                                                                            |
| Workbook                      | 20 worksheets; 100,000 populated cells across selected sheets | 20 / 100,000   | Counts real populated cells, not declared ranges.                                                                                                             |
| Parse wall time               | 30 seconds                                                    | 30 seconds     | Feasibility starting point; timeouts are rejected clearly.                                                                                                    |
| Sandbox memory                | 512 MiB including runtime and scratch                         | 512 MiB        | Host-enforced aggregate (GV-03); runtime overhead is measured separately in Phase 9.                                                                          |
| Scratch (overlay upper layer) | 128 MiB, inside the memory limit                              | none           | Room for libraries that spill to disk, with no host persistence.                                                                                              |
| Extracted output              | 16,777,216 bytes of UTF-8 JSON including provenance           | none           | Independent serialized-output cap. JSON escaping and provenance can make valid text under 10 MiB exceed it; reject clearly rather than truncate.              |
| Ordered blocks                | 100,000                                                       | none           | Bounds provenance work independently of file size. Many short lines or cell metadata can exceed it below the upload limit.                                    |
| Tokens per revision           | 3,000,000 with the embedding model's tokenizer                | none           | Independent tokenizer-specific cap, not a byte conversion. One maximal revision can use 60% of the 5,000,000-token term allowance; reservations still govern. |
| Chunks per revision           | 4,000; at most 1,000 tokens each, at most 100 overlap tokens  | none           | Bounds vector and index fan-out; the token cap usually binds first.                                                                                           |
| Guest limits                  | `NPROC` 64, `NOFILE` 128, `FSIZE` 16 MiB, `CORE` 0            | none           | Bounds process, file and core-dump explosions.                                                                                                                |

Owner aggregate limits still govern: 1 GiB held storage, 100 active sources, 3
retained revisions per source, 5,000,000 embedding tokens per term. They are
never multiplied into an assumed per-revision allowance.

## Concurrency and admission

At most **two running ingestion jobs per owner across all workspaces**
(approved). An owner's slot is held from scan through indexing. The two global
parse slots are an additional capacity bound, shared fairly by round-robin
across owners so that one owner cannot starve others. Internal retries reuse
the admitted run. A processing rejection consumes the run, and a
pre-admission validation rejection consumes none (v0.2 rules). A crashed lease
never allows duplicate publication, double settlement or a third job while
the earlier attempt's outcome is unknown.

## Rejection behavior

Stable codes with an understandable English explanation: `UNSUPPORTED_FORMAT`,
`UNSUPPORTED_ENCODING`, `ENCRYPTED`, `MALFORMED`, `IMAGE_ONLY_PDF`,
`LIMIT_PAGES`, `LIMIT_SLIDES`, `LIMIT_SHEETS`, `LIMIT_CELLS`,
`LIMIT_EXPANDED_SIZE`, `LIMIT_MEMBERS`, `LIMIT_RATIO`, `LIMIT_OUTPUT`,
`LIMIT_BLOCKS`, `LIMIT_TOKENS`, `LIMIT_CHUNKS`, `TIMEOUT`, `MEMORY`,
`SCANNER_UNAVAILABLE`, `INFECTED`. The system never truncates and publishes. A
partial extraction is either rejected or held with explicit omissions awaiting
acknowledgement. Every revision records input hash, parser image digest,
`runsc` version, policy version, output hash and the owner's approval. Any edit
or selection change creates a new revision and needs new approval.

## Phase 9 fixtures and benchmarks

Versioned, non-customer fixtures, each with expected text, provenance,
omissions, hash, language and terminal result. Every bound gets cases below,
at and above it, plus combinations. Run them only on the exact host and image,
never on a machine holding customer credentials.

- **Valid:** English, Chichewa and mixed UTF-8, including a 10,485,760-byte
  text file; Markdown with HTML and code; text-only, image-only and mixed
  PDFs; DOCX tables; XLSX with selected and hidden sheets and cached
  formulas; PPTX with hidden slides, notes and tables.
- **Malformed and hostile:** encrypted and truncated PDFs; malformed Office
  packages; ZIP and XML bombs; declared sizes that differ from actual
  expansion; 2,001 entries; ratio excess; nested archives; zip-slip,
  absolute paths and symlinks; XML entities and deep nesting; external links
  and templates; macros.
- **Independent bounds:** quote/backslash/control-dense valid UTF-8 whose JSON
  expansion exceeds 16 MiB; many short lines exceeding 100,000 blocks; and
  token-dense English, Chichewa and mixed text. Record which independent cap
  rejects each input even below 10 MiB. For example, 10 MiB of quotation marks
  serializes to more than 20 MiB before provenance. Do not promise every valid
  file below the upload cap will fit the extraction caps.
- **Runtime and operations:** scanner infected, timeout, stale-signature,
  reload and OOM cases; parser timeout, OOM, fork, descriptor and output
  floods; every egress and metadata attempt; agent and host restarts; lease
  expiry; owner deletion, expiry and takeover during a job; cleanup failure.

Record p50, p95 and p99 duration; CPU, peak memory and runtime overhead; and
expanded, output and chunk counts, with one and two concurrent jobs, cold and
warm. Acceptance requires all of the following:

- every valid fixture expected to fit produces exact reviewable text;
- every invalid fixture produces a clear bounded result;
- zero observed egress, credential or cross-job leakage;
- no orphaned resources.

One critical enforcement failure blocks release until the design or image
changes, the affected cases pass again, and an independent review passes.
Raising a bound needs a dated policy decision and a capacity check.

## Creation preflight and readiness

Before the VM takes any customer input, P records and B verifies the following.
Any failure stops creation and returns the runtime decision to the owner.
Cloudflare Containers is the documented fallback.

- The provider quote (expected about USD 24 per month at DO-01 prices), the
  Frankfurt location and its region identifier.
- Kernel, systemd and cgroup v2 versions, plus `runsc` version and checksum.
- Firewall rules: inbound 443 from Render Frankfurt ranges only, SSH closed,
  host egress allowlist.
- Console access for B.
- Automatic security updates and time sync.
- Host tmpfs for job directories, no active swap or hibernation, and persistent
  host/guest core dumping disabled. Inspect `/proc/swaps`, systemd coredump
  policy and each relevant service limit; restart/reboot checks must preserve
  these settings. A forced crash must leave no content on persistent storage.
- A smoke test proving network removal and the memory limit on a harmless
  fixture.

Readiness statement: every requirement in the enforcement matrix has a
documented or standard host-side enforcement path, so the isolation decision
is **ready for creation** subject to that preflight. It is not proven secure.
Release readiness requires the Phase 9 evidence. Residual risks remain:
`runsc` or kernel vulnerabilities, agent compromise, hardware side channels,
two jobs sharing one host kernel, and operator error.
