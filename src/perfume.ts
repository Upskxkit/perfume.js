/*!
 * Perfume.js v4.7.1 (http://zizzamia.github.io/perfume)
 * Copyright 2020 Leonardo Zizzamia (https://github.com/Zizzamia/perfume.js/graphs/contributors)
 * Licensed under MIT (https://github.com/Zizzamia/perfume.js/blob/master/LICENSE)
 * @license
 */
export interface IAnalyticsTrackerOptions {
  metricName: string;
  data?: any;
  duration?: number;
  eventProperties?: object;
  navigatorInformation?: object;
}

export interface IPerfumeConfig {
  // Metrics
  dataConsumption: boolean;
  resourceTiming: boolean;
  // Analytics
  analyticsTracker: (options: IAnalyticsTrackerOptions) => void;
  // Logging
  logPrefix: string;
  logging: boolean;
  maxMeasureTime: number;
}

export interface IPerfumeOptions {
  // Metrics
  dataConsumption?: boolean;
  resourceTiming?: boolean;
  // Analytics
  analyticsTracker?: (options: IAnalyticsTrackerOptions) => void;
  // Logging
  logPrefix?: string;
  logging?: boolean;
  maxMeasureTime?: number;
}

export interface ILogOptions {
  measureName: string;
  data?: any;
  customProperties?: object;
  navigatorInfo?: object;
}

export interface IMetricMap {
  [measureName: string]: boolean;
}

export interface IPerfObservers {
  [measureName: string]: any;
}

export interface ISendTimingOptions {
  measureName: string;
  data?: any;
  duration?: number;
  customProperties?: object;
  navigatorInfo?: object;
}

export type IPerfumeMetrics =
  | 'firstContentfulPaint'
  | 'firstPaint'
  | 'firstInputDelay';

export type IPerformanceObserverType =
  | 'first-input'
  | 'largest-contentful-paint'
  | 'longtask'
  | 'measure'
  | 'navigation'
  | 'paint'
  | 'resource';

export type IPerformanceEntryInitiatorType =
  | 'beacon'
  | 'css'
  | 'fetch'
  | 'img'
  | 'other'
  | 'script'
  | 'xmlhttprequest';

export declare interface IPerformanceEntry {
  decodedBodySize?: number;
  duration: number;
  entryType: IPerformanceObserverType;
  initiatorType?: IPerformanceEntryInitiatorType;
  loadTime: number;
  name: string;
  renderTime: number;
  startTime: number;
}

export interface IPerformancePaintTiming {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

declare const PerformanceObserver: any;

declare interface IPerformanceObserverEntryList {
  getEntries: any;
  getEntriesByName: any;
  getEntriesByType: any;
}

export interface IPerformanceObserver {
  observer: () => void;
  disconnect: () => void;
}

export interface IPerfumeNavigationTiming {
  fetchTime?: number;
  workerTime?: number;
  totalTime?: number;
  downloadTime?: number;
  timeToFirstByte?: number;
  headerSize?: number;
  dnsLookupTime?: number;
}

type EffectiveConnectionType = '2g' | '3g' | '4g' | 'slow-2g';

export interface IPerfumeNetworkInformation {
  downlink?: number;
  effectiveType?: EffectiveConnectionType;
  onchange?: () => void;
  rtt?: number;
  saveData?: boolean;
}

export interface IPerfumeDataConsumption {
  beacon: number;
  css: number;
  fetch: number;
  img: number;
  other: number;
  script: number;
  total: number;
  xmlhttprequest: number;
}

export default class Perfume {
  config: IPerfumeConfig = {
    // Metrics
    dataConsumption: false,
    resourceTiming: false,
    // Analytics
    analyticsTracker: options => {},
    // Logging
    logPrefix: 'Perfume.js:',
    logging: true,
    maxMeasureTime: 15000,
  };
  copyright = '© 2020 Leonardo Zizzamia';
  version = '4.7.1';
  private c = window.console;
  private d = document;
  private dataConsumptionTimeout: any;
  private isHidden: boolean = false;
  private lcpDuration: number = 0;
  private logPrefixRecording = 'Recording already';
  private metrics: IMetricMap = {};
  private perfObserver: any;
  private perfObservers: IPerfObservers = {};
  private perfResourceTiming: IPerfumeDataConsumption = {
    beacon: 0,
    css: 0,
    fetch: 0,
    img: 0,
    other: 0,
    script: 0,
    total: 0,
    xmlhttprequest: 0,
  };
  private w = window;
  private wp = window.performance;
  private wn = window.navigator;

  constructor(options: IPerfumeOptions = {}) {
    // Extend default config with external options
    this.config = Object.assign({}, this.config, options) as IPerfumeConfig;

    // Exit from Perfume when basic Web Performance APIs aren't supported
    if (!this.isPerformanceSupported()) {
      return;
    }

    // Checks if use Performance or the EmulatedPerformance instance
    if (this.isPerformanceObserverSupported()) {
      try {
        this.initPerformanceObserver();
      } catch (e) {
        if (this.config.logging) {
          this.c.warn(this.config.logPrefix, e);
        }
      }
    }

    // Init visibilitychange listener
    this.onVisibilityChange();
    // Log Navigation Timing
    this.logData('navigationTiming', this.getNavigationTiming());
    // Log Network Information
    this.logData('networkInformation', this.getNetworkInformation());
  }

  /**
   * Start performance measurement
   */
  start(markName: string): void {
    if (!this.isPerformanceSupported()) {
      return;
    }
    if (this.metrics[markName]) {
      this.logWarn(`${this.logPrefixRecording} started.`);
      return;
    }
    this.metrics[markName] = true;
    // Creates a timestamp in the browser's performance entry buffer
    this.wp.mark(`mark_${markName}_start`);
    // Reset hidden value
    this.isHidden = false;
  }

  /**
   * End performance measurement
   */
  end(markName: string, customProperties = {}): void {
    if (!this.isPerformanceSupported()) {
      return;
    }
    if (!this.metrics[markName]) {
      this.logWarn(`${this.logPrefixRecording} stopped.`);
      return;
    }
    // End Performance Mark
    this.wp.mark(`mark_${markName}_end`);
    // Get duration and change it to a two decimal value
    const durationByMetric = this.performanceMeasure(markName);
    const duration2Decimal = parseFloat(durationByMetric.toFixed(2));
    delete this.metrics[markName];
    this.pushTask(() => {
      const options = {
        measureName: markName,
        data: duration2Decimal,
        duration: duration2Decimal,
        customProperties,
        navigatorInfo: this.getNavigatorInfo(),
      };
      // Log to console, delete metric and send to analytics tracker
      this.log(options);
      this.sendTiming(options);
    });
  }

  /**
   * End performance measurement after first paint from the beging of it
   */
  endPaint(markName: string, customProperties?: object): void {
    setTimeout(() => {
      this.end(markName, customProperties);
    });
  }

  clear(markName: string): void {
    this.wp.clearMarks(`mark_${markName}_start`);
    this.wp.clearMarks(`mark_${markName}_end`);
    delete this.metrics[markName];
  }

  private didVisibilityChange = () => {
    if (this.d.hidden) {
      this.isHidden = this.d.hidden;
    }
  };

  private digestFirstInputDelayEntries(
    performanceEntries: IPerformanceEntry[],
  ): void {
    this.performanceObserverCb({
      performanceEntries,
      measureName: 'firstInputDelay',
      valueLog: 'duration',
    });
    this.disconnectlargestContentfulPaint();
    this.disconnectDataConsumption();
  }

  private disconnectDataConsumption(): void {
    if (!this.dataConsumptionTimeout) {
      return;
    }
    clearTimeout(this.dataConsumptionTimeout);
    this.dataConsumptionTimeout = undefined;
    this.logData('dataConsumption', this.perfResourceTiming);
  }

  private disconnectlargestContentfulPaint(): void {
    if (this.perfObservers.lcp && this.lcpDuration) {
      this.logMetric(this.lcpDuration, 'largestContentfulPaint');
      this.perfObservers.lcp.disconnect();
    }
  }

  private initFirstInputDelay(): void {
    this.perfObservers.fid = this.performanceObserver(
      'first-input',
      this.digestFirstInputDelayEntries.bind(this),
    );
  }

  /**
   * First Paint is essentially the paint after which
   * the biggest above-the-fold layout change has happened.
   */
  private initFirstPaint(): void {
    this.perfObservers.fcp = this.performanceObserver(
      'paint',
      (performanceEntries: IPerformanceEntry[]) => {
        this.performanceObserverCb({
          performanceEntries,
          entryName: 'first-paint',
          measureName: 'firstPaint',
          valueLog: 'startTime',
        });
        this.performanceObserverCb({
          performanceEntries,
          entryName: 'first-contentful-paint',
          measureName: 'firstContentfulPaint',
          valueLog: 'startTime',
        });
      },
    );
  }

  private initLargestContentfulPaint(): void {
    this.perfObservers.lcp = this.performanceObserver(
      'largest-contentful-paint',
      (performanceEntries: IPerformanceEntry[]) => {
        const lastEntry = performanceEntries.pop();
        if (lastEntry) {
          this.lcpDuration = lastEntry.renderTime || lastEntry.loadTime;
        }
      },
    );
  }

  private initPerformanceObserver(): void {
    this.initFirstPaint();
    // FID needs to be initialized as soon as Perfume is available
    // DataConsumption resolves after FID is triggered
    this.initFirstInputDelay();
    this.initLargestContentfulPaint();
    // Collects KB information related to resources on the page
    if (this.config.resourceTiming || this.config.dataConsumption) {
      this.initResourceTiming();
    }
  }

  private initResourceTiming(): void {
    this.performanceObserver(
      'resource',
      (performanceEntries: IPerformanceEntry[]) => {
        this.performanceObserverResourceCb({
          performanceEntries,
        });
      },
    );
    this.dataConsumptionTimeout = setTimeout(() => {
      this.disconnectDataConsumption();
    }, 15000);
  }

  /**
   * True if the browser supports the Navigation Timing API,
   * User Timing API and the PerformanceObserver Interface.
   * In Safari, the User Timing API (performance.mark()) is not available,
   * so the DevTools timeline will not be annotated with marks.
   * Support: developer.mozilla.org/en-US/docs/Web/API/Performance/mark
   * Support: developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver
   * Support: developer.mozilla.org/en-US/docs/Web/API/Performance/getEntriesByType
   */
  private isPerformanceSupported(): boolean {
    return (
      this.wp && !!this.wp.getEntriesByType && !!this.wp.now && !!this.wp.mark
    );
  }

  /**
   * For now only Chrome fully support the PerformanceObserver interface
   * and the entryType "paint".
   * Firefox 58: https://bugzilla.mozilla.org/show_bug.cgi?id=1403027
   */
  private isPerformanceObserverSupported(): boolean {
    return (this.w as any).chrome && 'PerformanceObserver' in this.w;
  }

  /**
   * Get the duration of the timing metric or -1 if there a measurement has
   * not been made by the User Timing API
   */
  private getDurationByMetric(measureName: string): number {
    const performanceEntries = this.wp.getEntriesByName(measureName);
    const entry = performanceEntries[performanceEntries.length - 1];
    if (entry && entry.entryType === 'measure') {
      return entry.duration;
    }
    return -1;
  }

  private getNavigatorInfo(): object {
    if (this.wn) {
      return {
        deviceMemory: (this.wn as any).deviceMemory
          ? (this.wn as any).deviceMemory
          : 0,
        hardwareConcurrency: (this.wn as any).hardwareConcurrency
          ? (this.wn as any).hardwareConcurrency
          : 0,
      };
    }
    return {};
  }

  /**
   * Navigation Timing API provides performance metrics for HTML documents.
   * w3c.github.io/navigation-timing/
   * developers.google.com/web/fundamentals/performance/navigation-and-resource-timing
   */
  private getNavigationTiming(): IPerfumeNavigationTiming {
    if (!this.isPerformanceSupported()) {
      return {};
    }
    // There is an open issue to type correctly getEntriesByType
    // github.com/microsoft/TypeScript/issues/33866
    const n = performance.getEntriesByType('navigation')[0] as any;
    // In Safari version 11.2 Navigation Timing isn't supported yet
    if (!n) {
      return {};
    }
    const responseStart = n.responseStart;
    const responseEnd = n.responseEnd;
    // We cache the navigation time for future times
    return {
      // fetchStart marks when the browser starts to fetch a resource
      // responseEnd is when the last byte of the response arrives
      fetchTime: responseEnd - n.fetchStart,
      // Service worker time plus response time
      workerTime: n.workerStart > 0 ? responseEnd - n.workerStart : 0,
      // Request plus response time (network only)
      totalTime: responseEnd - n.requestStart,
      // Response time only (download)
      downloadTime: responseEnd - responseStart,
      // Time to First Byte (TTFB)
      timeToFirstByte: responseStart - n.requestStart,
      // HTTP header size
      headerSize: n.transferSize - n.encodedBodySize || 0,
      // Measuring DNS lookup time
      dnsLookupTime: n.domainLookupEnd - n.domainLookupStart,
    };
  }

  private getNetworkInformation(): IPerfumeNetworkInformation {
    if ('connection' in this.wn) {
      const dataConnection = (this.wn as any).connection;
      if (typeof dataConnection !== 'object') {
        return {};
      }
      return {
        downlink: dataConnection.downlink,
        effectiveType: dataConnection.effectiveType,
        rtt: dataConnection.rtt,
        saveData: !!dataConnection.saveData,
      };
    }
    return {};
  }

  private logData(measureName: string, data: any): void {
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'number') {
        data[key] = parseFloat(data[key].toFixed(2));
      }
    });
    const navigatorInfo = this.getNavigatorInfo();
    this.pushTask(() => {
      // Logs the metric in the internal console.log
      this.log({ measureName, data, navigatorInfo });
      // Sends the metric to an external tracking service
      this.sendTiming({ measureName, data, navigatorInfo });
    });
  }

  /**
   * Dispatches the metric duration into internal logs
   * and the external time tracking service.
   */
  private logMetric(
    duration: number,
    measureName: string,
    suffix: string = 'ms',
  ): void {
    const duration2Decimal = parseFloat(duration.toFixed(2));
    // Stop Analytics and Logging for false negative metrics
    if (
      duration2Decimal > this.config.maxMeasureTime ||
      duration2Decimal <= 0
    ) {
      return;
    }
    const navigatorInfo = this.getNavigatorInfo();
    this.pushTask(() => {
      // Logs the metric in the internal console.log
      this.log({
        measureName,
        data: `${duration2Decimal} ${suffix}`,
        navigatorInfo,
      });
      // Sends the metric to an external tracking service
      this.sendTiming({
        measureName,
        duration: duration2Decimal,
        navigatorInfo,
      });
    });
  }

  /**
   * Coloring Text in Browser Console
   */
  private log(options: ILogOptions): void {
    // Don't log when page is hidden or has disabled logging
    if (this.isHidden || !this.config.logging) {
      return;
    }
    const style = 'color:#ff6d00;font-size:11px;';
    this.c.log(
      `%c ${this.config.logPrefix} ${options.measureName} `,
      style,
      options.data,
      options.navigatorInfo,
    );
  }

  /**
   * Ensures console.warn exist and logging is enable for
   * warning messages
   */
  private logWarn(message: string): void {
    if (!this.config.logging) {
      return;
    }
    this.c.warn(this.config.logPrefix, message);
  }

  /**
   * From visibilitychange listener it saves only when
   * the page gets hidden, because it's important to not
   * use the wrong "hidden" value when send timing or logging.
   */
  private onVisibilityChange() {
    if (typeof this.d.hidden !== 'undefined') {
      // Opera 12.10 and Firefox 18 and later support
      this.d.addEventListener('visibilitychange', this.didVisibilityChange);
    }
  }

  private performanceMeasure(measureName: string): number {
    const startMark = `mark_${measureName}_start`;
    const endMark = `mark_${measureName}_end`;
    this.wp.measure(measureName, startMark, endMark);
    return this.getDurationByMetric(measureName);
  }

  /**
   * PerformanceObserver subscribes to performance events as they happen
   * and respond to them asynchronously.
   */
  private performanceObserver(
    eventType: IPerformanceObserverType,
    cb: (performanceEntries: any[]) => void,
  ): IPerformanceObserver {
    this.perfObserver = new PerformanceObserver(
      (entryList: IPerformanceObserverEntryList) => {
        const performanceEntries = entryList.getEntries();
        cb(performanceEntries);
      },
    );
    // Retrieve buffered events and subscribe to newer events for Paint Timing
    this.perfObserver.observe({ type: eventType, buffered: true });
    return this.perfObserver;
  }

  /**
   * Logging Performance Paint Timing
   */
  private performanceObserverCb(options: {
    performanceEntries: IPerformanceEntry[];
    entryName?: string;
    measureName: IPerfumeMetrics;
    valueLog: 'duration' | 'startTime';
  }): void {
    options.performanceEntries.forEach(
      (performanceEntry: IPerformanceEntry) => {
        if (
          !options.entryName ||
          (options.entryName && performanceEntry.name === options.entryName)
        ) {
          this.logMetric(
            performanceEntry[options.valueLog],
            options.measureName,
          );
        }
        if (
          this.perfObservers.fcp &&
          performanceEntry.name === 'first-contentful-paint'
        ) {
          this.perfObservers.fcp.disconnect();
        }
      },
    );
    if (this.perfObservers.fid && options.measureName === 'firstInputDelay') {
      this.perfObservers.fid.disconnect();
    }
  }

  private performanceObserverResourceCb(options: {
    performanceEntries: IPerformanceEntry[];
  }): void {
    options.performanceEntries.forEach(
      (performanceEntry: IPerformanceEntry) => {
        if (this.config.resourceTiming) {
          this.logData('resourceTiming', performanceEntry);
        }
        if (
          this.config.dataConsumption &&
          performanceEntry.decodedBodySize &&
          performanceEntry.initiatorType
        ) {
          const bodySize = performanceEntry.decodedBodySize / 1000;
          this.perfResourceTiming[performanceEntry.initiatorType] += bodySize;
          this.perfResourceTiming.total += bodySize;
        }
      },
    );
  }

  /**
   * PushTask to requestIdleCallback
   */
  private pushTask(cb: any): void {
    if ('requestIdleCallback' in this.w) {
      (this.w as any).requestIdleCallback(cb, { timeout: 3000 });
    } else {
      cb();
    }
  }

  /**
   * Sends the User timing measure to analyticsTracker
   */
  private sendTiming(options: ISendTimingOptions): void {
    // Doesn't send timing when page is hidden
    if (this.isHidden) {
      return;
    }
    const {
      measureName,
      data,
      duration,
      customProperties,
      navigatorInfo,
    } = options;
    const eventProperties = customProperties ? customProperties : {};
    // Send metric to custom Analytics service
    this.config.analyticsTracker({
      metricName: measureName,
      data,
      duration,
      eventProperties,
      navigatorInformation: navigatorInfo,
    });
  }
}
