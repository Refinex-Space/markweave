import * as VueModule from "vue";
import type Vue from "vue";
import type {
  PropType as VuePropType,
  VueConstructor,
} from "vue";

type CreateElement = (...args: unknown[]) => unknown;

export type Component<T = unknown> = VueConstructor<Vue> | Vue;
export type PropType<T> = VuePropType<T>;
export interface Ref<T> {
  value: T;
}

interface WatchOptions {
  readonly immediate?: boolean;
  readonly deep?: boolean;
  readonly flush?: "post";
}

interface LifecycleBucket {
  readonly mounted: Array<() => void>;
  readonly beforeUnmount: Array<() => void>;
}

const VueRuntime = ((VueModule as { default?: unknown }).default ?? VueModule) as VueConstructor<Vue>;

let currentSetupInstance: { $watch?: (source: unknown, callback: unknown, options?: unknown) => () => void } | null = null;
let currentLifecycleBucket: LifecycleBucket | null = null;
let currentCreateElement: CreateElement | null = null;

function isRefObject(value: unknown): value is Ref<unknown> {
  return Boolean(value && typeof value === "object" && "value" in value);
}

function normalizeEventName(name: string) {
  const rawName = name.slice(2);
  if (rawName.endsWith("Capture")) {
    const baseName = rawName.slice(0, -"Capture".length).replace(/^[A-Z]/, (value) => value.toLowerCase());
    return `!${baseName}`;
  }

  return rawName.replace(/^[A-Z]/, (value) => value.toLowerCase());
}

function normalizeNativeData(data: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  const attrs: Record<string, unknown> = {};
  const domProps: Record<string, unknown> = {};
  const on: Record<string, unknown> = {};
  const hook: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }

    if (key === "class" || key === "style" || key === "key") {
      normalized[key] = value;
      continue;
    }

    if (key === "ref" && isRefObject(value)) {
      hook.insert = (vnode: { elm?: unknown }) => {
        value.value = vnode.elm;
      };
      hook.destroy = () => {
        value.value = null;
      };
      continue;
    }

    if (/^on[A-Z]/.test(key)) {
      on[normalizeEventName(key)] = value;
      continue;
    }

    if (key === "value" || key === "checked" || key === "innerHTML" || key === "textContent") {
      domProps[key] = value;
      continue;
    }

    attrs[key] = value;
  }

  if (Object.keys(attrs).length) {
    normalized.attrs = attrs;
  }
  if (Object.keys(domProps).length) {
    normalized.domProps = domProps;
  }
  if (Object.keys(on).length) {
    normalized.on = on;
  }
  if (Object.keys(hook).length) {
    normalized.hook = hook;
  }

  return normalized;
}

function normalizeComponentData(data: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  const props: Record<string, unknown> = {};
  const attrs: Record<string, unknown> = {};
  const hook: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }

    if (key === "class" || key === "style" || key === "key") {
      normalized[key] = value;
      continue;
    }

    if (key === "ref" && isRefObject(value)) {
      hook.insert = (vnode: { componentInstance?: unknown; elm?: unknown }) => {
        value.value = vnode.componentInstance ?? vnode.elm;
      };
      hook.destroy = () => {
        value.value = null;
      };
      continue;
    }

    if (key.startsWith("data-") || key.startsWith("aria-") || key === "role" || key === "tabindex") {
      attrs[key] = value;
      continue;
    }

    props[key] = value;
  }

  if (Object.keys(props).length) {
    normalized.props = props;
  }
  if (Object.keys(attrs).length) {
    normalized.attrs = attrs;
  }
  if (Object.keys(hook).length) {
    normalized.hook = hook;
  }

  return normalized;
}

function isDefaultSlotObject(value: unknown): value is { default: (slotProps?: unknown) => unknown } {
  return Boolean(value && typeof value === "object" && "default" in value && typeof (value as { default?: unknown }).default === "function");
}

function isVNodeLike(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("tag" in value || "text" in value || "elm" in value || "componentOptions" in value || "componentInstance" in value),
  );
}

function normalizeSlotChildren(slotChildren: unknown) {
  if (slotChildren === null || slotChildren === undefined || Array.isArray(slotChildren)) {
    return slotChildren;
  }
  return [slotChildren];
}

function normalizeChildren(children: unknown) {
  if (typeof children === "function") {
    return normalizeSlotChildren(children());
  }

  if (isDefaultSlotObject(children)) {
    return normalizeSlotChildren(children.default());
  }

  if (isVNodeLike(children)) {
    return [children];
  }

  return children;
}

export function h(tag: unknown, data?: unknown, children?: unknown) {
  if (!currentCreateElement) {
    throw new Error("Vue 2 render context is not available.");
  }

  const rawData = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const isNativeElement = typeof tag === "string";
  const normalizedData = isNativeElement ? normalizeNativeData(rawData) : normalizeComponentData(rawData);
  const normalizedChildren = arguments.length === 2 && (Array.isArray(data) || typeof data === "string") ? data : normalizeChildren(children);

  return currentCreateElement(tag, normalizedData, normalizedChildren);
}

export function ref<T>(value: T): Ref<T> {
  return VueRuntime.observable({ value });
}

export const shallowRef = ref;

export function computed<T>(getter: () => T): Ref<T> {
  return {
    get value() {
      return getter();
    },
  };
}

export function watch<T>(source: (() => T) | Ref<T>, callback: (value: T, oldValue: T) => void, options?: WatchOptions) {
  const getter = typeof source === "function" ? source : () => source.value;
  const instance = currentSetupInstance;

  if (!instance?.$watch) {
    return () => undefined;
  }

  const vueOptions = options
    ? { deep: options.deep, immediate: options.immediate }
    : undefined;
  if (options?.flush !== "post") {
    return instance.$watch(getter, callback, vueOptions);
  }

  let stopped = false;
  let queued = false;
  let latestValue!: T;
  let firstOldValue!: T;
  const stop = instance.$watch(
    getter,
    (value: T, oldValue: T) => {
      latestValue = value;
      if (queued) {
        return;
      }
      queued = true;
      firstOldValue = oldValue;
      void Promise.resolve(VueRuntime.nextTick()).then(() => {
        if (stopped) {
          return;
        }
        queued = false;
        callback(latestValue, firstOldValue);
      });
    },
    vueOptions,
  );

  const teardown = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    stop();
  };
  currentLifecycleBucket?.beforeUnmount.push(teardown);
  return teardown;
}

export function onMounted(callback: () => void) {
  currentLifecycleBucket?.mounted.push(callback);
}

export function onBeforeUnmount(callback: () => void) {
  currentLifecycleBucket?.beforeUnmount.push(callback);
}

export function nextTick(callback?: () => void) {
  return callback ? VueRuntime.nextTick(callback) : VueRuntime.nextTick();
}

export function defineComponent(options: {
  readonly name?: string;
  readonly props?: Record<string, unknown>;
  readonly setup?: (props: any) => (() => unknown) | Record<string, unknown> | null | undefined;
  readonly render?: (createElement: CreateElement) => unknown;
}): VueConstructor<Vue> {
  return VueRuntime.extend({
    name: options.name,
    props: options.props,
    created(this: Record<string, unknown> & { $watch?: (source: unknown, callback: unknown, options?: unknown) => () => void }) {
      const lifecycleBucket: LifecycleBucket = { mounted: [], beforeUnmount: [] };
      currentSetupInstance = this;
      currentLifecycleBucket = lifecycleBucket;

      try {
        const setupResult = options.setup?.((this.$props ?? this) as any) ?? null;
        this.__markweaveVue2Render = typeof setupResult === "function" ? setupResult : null;
        this.__markweaveVue2Lifecycle = lifecycleBucket;
      } finally {
        currentSetupInstance = null;
        currentLifecycleBucket = null;
      }
    },
    mounted(this: Record<string, unknown>) {
      (this.__markweaveVue2Lifecycle as LifecycleBucket | undefined)?.mounted.forEach((callback) => callback());
    },
    beforeDestroy(this: Record<string, unknown>) {
      (this.__markweaveVue2Lifecycle as LifecycleBucket | undefined)?.beforeUnmount.forEach((callback) => callback());
    },
    render(this: Record<string, unknown>, createElement: CreateElement) {
      currentCreateElement = createElement;
      try {
        const setupRender = this.__markweaveVue2Render as (() => unknown) | null | undefined;
        if (setupRender) {
          return setupRender();
        }

        return options.render?.(createElement) ?? null;
      } finally {
        currentCreateElement = null;
      }
    },
  } as any) as VueConstructor<Vue>;
}
