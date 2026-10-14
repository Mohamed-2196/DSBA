// Security review, rounds 5 to 9 (docs/reviews/security.md), SEC-31. Passes while the finding is real: Mini Noora's
// saved conversations outlive sign-out on a shared computer. Turn it around once the key is cleared on sign-out.
import { afterEach, beforeEach, expect, it } from "vitest";
import { RECENT_KEY } from "../features/noora/saved";
import { clearPersonalStorage } from "./queries";

const store = new Map<string, string>();
const storage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
const g = globalThis as unknown as {
  window?: EventTarget & { localStorage: typeof storage };
};

beforeEach(() => {
  store.clear();
  g.window = Object.assign(new EventTarget(), { localStorage: storage });
});

afterEach(() => {
  delete g.window;
});

it("SEC-31: signing out leaves Mini Noora’s recent chats in localStorage", () => {
  storage.setItem("hub.mine.grades", "{}");
  storage.setItem(
    RECENT_KEY,
    JSON.stringify([
      {
        id: "chat-1",
        at: 1,
        title: "Is my resit fee refundable?",
        messages: [],
      },
    ]),
  );
  clearPersonalStorage();
  expect(storage.getItem("hub.mine.grades")).toBeNull(); // personal keys go
  expect(storage.getItem(RECENT_KEY)).toContain("resit fee"); // her conversations stay for the next person
});
