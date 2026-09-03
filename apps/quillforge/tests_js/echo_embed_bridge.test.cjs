'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createEmbedBridge } = require('../src/static/echo-embed-bridge.js');

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    emit(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

function fakeDocument(events) {
  const documentRef = eventTarget();
  Object.assign(documentRef, {
    readyState: 'complete',
    documentElement: { dataset: {} },
    defaultView: {
      CustomEvent: class CustomEvent {
        constructor(type) {
          this.type = type;
        }
      },
    },
    dispatchEvent(event) {
      events.push(event.type);
    },
  });
  return documentRef;
}

test('embedded bridge announces ready and owns Escape', () => {
  const sent = [];
  const events = [];
  const windowRef = eventTarget();
  const documentRef = fakeDocument(events);
  const parent = {
    postMessage(message, origin) {
      sent.push([message, origin]);
    },
  };
  Object.assign(windowRef, { parent });

  const bridge = createEmbedBridge({ windowRef, documentRef });
  assert.equal(bridge.install(), true);
  assert.deepEqual(sent, [[{ type: 'quillforge:ready' }, '*']]);

  let prevented = 0;
  let stopped = 0;
  windowRef.emit('keydown', {
    key: 'Escape',
    preventDefault() {
      prevented += 1;
    },
    stopImmediatePropagation() {
      stopped += 1;
    },
  });

  assert.deepEqual(sent.at(-1), [{ type: 'echo:pause-request' }, '*']);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  windowRef.emit('message', {
    source: parent,
    data: { type: 'echo:pause' },
  });
  assert.equal(documentRef.documentElement.dataset.echoPaused, 'true');
  assert.deepEqual(events, ['echo:pause']);

  windowRef.emit('message', {
    source: parent,
    data: { type: 'echo:resume' },
  });
  assert.equal(documentRef.documentElement.dataset.echoPaused, 'false');
  assert.deepEqual(events, ['echo:pause', 'echo:resume']);

  windowRef.emit('message', {
    source: {},
    data: { type: 'echo:pause' },
  });
  assert.deepEqual(events, ['echo:pause', 'echo:resume']);

  bridge.destroy();
  assert.equal(windowRef.listeners.size, 0);
});

test('standalone bridge leaves keyboard and messaging untouched', () => {
  const windowRef = eventTarget();
  const documentRef = fakeDocument([]);
  Object.assign(windowRef, { parent: windowRef });

  const bridge = createEmbedBridge({ windowRef, documentRef });
  assert.equal(bridge.install(), false);
  assert.equal(windowRef.listeners.size, 0);
});
