// Lets the phone treat You free? as an app. Nothing is cached, so sessions always show live data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
