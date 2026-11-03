import assert from 'node:assert/strict';
import test from 'node:test';

test('library storage can recover after IndexedDB open fails', async () => {
  let attempts = 0;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        if (++attempts === 1) {
          request.error = new Error('storage temporarily unavailable');
          request.onerror();
        } else {
          request.result = {
            transaction() {
              const transaction = { objectStore: () => ({ getAll: () => ({ result: [{ id: 'b1', addedAt: 1 }] }) }) };
              queueMicrotask(() => transaction.oncomplete());
              return transaction;
            },
          };
          request.onsuccess();
        }
      });
      return request;
    },
  };
  const books = await import('../site/js/reader/book-store.js');
  await assert.rejects(books.listBooks(), /temporarily unavailable/);
  assert.deepEqual(await books.listBooks(), [{ id: 'b1', addedAt: 1 }]);
  assert.equal(attempts, 2);
});
