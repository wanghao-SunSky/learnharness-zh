# Experimental LearnHarness → ACP adapter

This adapter uses the **running LearnHarness Personal backend**, including its model settings and persisted course records. It does not create a second teaching engine or copy the course database. Initially tested with T3 Code 0.1.7; other clients must support ACP form elicitation.

## Setup on macOS

Build and open LearnHarness Personal first; configure your own provider/models in the desktop app. The packaged Personal shell starts the local bridge. The plain `npm run dev` web server does not start it.

```sh
npm ci --prefix acp
npm run --prefix acp build
npm test --prefix acp
node acp/install-runtime.mjs
command -v node
```

In the client's ACP provider settings, use the **absolute Node executable path** printed by the last command. Add one argument: the **absolute runtime/bridge.mjs path** printed by the installer. GUI-launched clients may not inherit your shell PATH; `~` is not expanded in every client. The installed runtime needs only `bridge.mjs` and `core.mjs`; it does not need `node_modules`.

The provider advertises `LearnHarness 中文学习` and a single logical model, `LearnHarness · 课程原有模型`. The actual model is selected in Personal. Existing courses retain their own model setting; changing the global default only affects newly created courses.

## Course interaction

- Import an existing native session from the client's session list, or start a new session with a learning topic.
- One prompt stays active across successive questions. Submit an answer to continue the explanation and open the next question automatically.
- Form fields are reduced to the actual answer. Optional reading thoughts and reasoning are omitted; quiz confidence defaults to 80/100. “暂时不知道” omits confidence. This is a personal convenience setting, not a measured confidence estimate.
- Stop/cancel preserves the unanswered question. Send `继续` to resume after stopping or reloading. `/refresh` reads the latest record; `/retry` retries a failed backend turn.
- If the same question is answered on the desktop, the pending client form is withdrawn and the adapter follows the backend state.

## Phone access and boundaries

Configure the client's own authenticated remote access separately. In T3, connect the phone to the same computer/environment and select this provider. Keep the Mac awake, online, and running both Personal and the client server. This repository does not provision tunnels, accounts, or authentication for you.

The bridge uses `~/Library/Application Support/LearnHarness Personal/acp/bridge.sock`, restricted to the current user (directory 0700, socket 0600). It allows a small set of course routes and keeps the desktop access capability local. Do not replace this with an unauthenticated public HTTP port. Any process running as your OS user may access the socket; this is not a boundary against other apps running as that user.

T3 presents text and its own question forms, not the Personal desktop design. Math rendering and raw tool-detail display depend on the client. Titles are not synchronized bidirectionally. Attachments, knowledge graph controls, and settings remain desktop-first. The original LearnHarness app has a separate data directory and is not synchronized by this adapter.

## Maintenance

After changing `core.ts`, rebuild with `npm run --prefix acp build`. Run `node --test acp/bridge.test.mjs` and reinstall the runtime. Restart the ACP helper after installation; a running process retains the old modules. Changes to the Electron shell require rebuilding the Personal desktop app.

The tests use synthetic fixtures, fake model responses, and a temporary local socket. They cover protocol/data handling, not every phone/client UI or third-party model. `package-shell.mjs` is a development-only helper for an explicitly supplied Personal app copy, not the normal installation path.
