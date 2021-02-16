import { SuperTabsConfig } from './interface';


export const DEFAULT_CONFIG: SuperTabsConfig = {
  dragThreshold: 20,
  allowElementScroll: false,
  maxDragAngle: 40,
  sideMenuThreshold: 50,
  transitionDuration: 150,
  shortSwipeDuration: 300,
  debug: false,
  avoidElements: false,
  lazyLoad: false,
  unloadWhenInvisible: false,
};

export type STCoord = {
  x: number;
  y: number;
}

export function pointerCoord(ev: any): STCoord {
  // get X coordinates for either a mouse click
  // or a touch depending on the given event
  if (ev) {
    const changedTouches = ev.changedTouches;
    if (changedTouches && changedTouches.length > 0) {
      const touch = changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    if (ev.pageX !== undefined) {
      return { x: ev.pageX, y: ev.pageY };
    }
  }
  return { x: 0, y: 0 };
}

const nativeScrollAvailable: boolean = 'scrollBehavior' in document.documentElement.style;

let _getTs: () => number;

if (window.performance && window.performance.now) {
  _getTs = window.performance.now.bind(window.performance);
} else {
  _getTs = Date.now.bind(Date);
}

export const getTs = _getTs;

export const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

function getScrollCoord(start: number, dest: number, startTime: number, currentTime: number, duration: number) {
  const time = Math.min(1, (currentTime - startTime) / duration);
  const timeFn = easeInOutCubic(time);
  return Math.ceil((timeFn * (dest - start)) + start);
}

function scroll(el: Element, startX: number, x: number, startTime: number, duration: number) {
  const currentTime = getTs();
  const scrollX = startX === x ? x : getScrollCoord(startX, x, startTime, currentTime, duration);

  el.scrollTo(scrollX, 0);

  if (currentTime - startTime >= duration) {
    return;
  }

  requestAnimationFrame(() => {
    scroll(el, startX, x, startTime, duration);
  });
}

export const scrollEl = (el: Element, x: number, native: boolean, duration: number = 300) => {
  if (duration <= 0) {
    requestAnimationFrame(() => {
      el.scrollTo(x, 0);
    });
    return;
  }

  if (native && nativeScrollAvailable) {
    el.scrollTo({
      left: x,
      behavior: 'smooth',
    });
    return;
  }

  requestAnimationFrame(() => {
    scroll(el, el.scrollLeft, x, getTs(), duration);
  });
};

export function checkGesture(newCoords: STCoord, initialCoords: STCoord, config: SuperTabsConfig): boolean {
  if (!initialCoords) {
    return false;
  }

  const radians = config.maxDragAngle! * (Math.PI / 180);
  const maxCosine = Math.cos(radians);
  const deltaX = newCoords.x - initialCoords.x;
  const deltaY = newCoords.y - initialCoords.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (distance >= config.dragThreshold!) {
    // swipe is long enough
    // lets check the angle
    const angle = Math.atan2(deltaY, deltaX);
    const cosine = Math.cos(angle);
    return Math.abs(cosine) > maxCosine;
  }

  return false;
}

export function getNormalizedScrollX(el: HTMLElement, width: number, delta: number = 0): number {
  return Math.max(0, Math.min(el.scrollWidth - width, el.scrollLeft + delta))
}

const debugStyle1 = 'background: linear-gradient(135deg,#4150b2,#f71947); border: 1px solid #9a9a9a; color: #ffffff; border-bottom-left-radius: 2px; border-top-left-radius: 2px; padding: 2px 0 2px 4px;';
const debugStyle2 = 'background: #252b3e; border: 1px solid #9a9a9a; border-top-right-radius: 2px; border-bottom-right-radius: 2px; margin-left: -2px; padding: 2px 4px; color: white;';

export function debugLog(config: SuperTabsConfig, tag: string, vals: any[]) {
  if (!config || !config.debug) {
    return;
  }

  // Some gorgeous logging, because apparently I have lots of free time to style console logs and write this comment
  console.log(`%csuper-tabs %c%s`, debugStyle1, debugStyle2, ' '.repeat(10 - tag.length) + tag, ...vals);
}
