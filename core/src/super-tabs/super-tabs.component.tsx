import {
  Component,
  ComponentInterface,
  Element,
  Event,
  EventEmitter,
  h,
  Host,
  Listen,
  Method,
  Prop,
  Watch,
} from '@stencil/core';
import { SuperTabChangeEventDetail, SuperTabsConfig } from '../interface';
import { debugLog, DEFAULT_CONFIG } from '../utils';


const maxInitRetries: number = 1e3;

/**
 * Root component that controls the other super-tab components.
 *
 * This component propagates configuration over to children and keeps track of the tabs state.
 */
@Component({
  tag: 'super-tabs',
  styleUrl: 'super-tabs.component.scss',
  shadow: true,
})
export class SuperTabsComponent implements ComponentInterface {
  @Element() el!: HTMLSuperTabsElement;

  /**
   * Tab change event.
   *
   * This event fires up when a tab button is clicked, or when a user swipes between tabs.
   *
   * The event will fire even if the tab did not change, you can check if the tab changed by checking the `changed`
   * property in the event detail.
   */
  @Event() tabChange!: EventEmitter<SuperTabChangeEventDetail>;

  /**
   * Global Super Tabs configuration.
   *
   * This is the only place you need to configure the components. Any changes to this input will propagate to child
   * components.
   *
   * @type {SuperTabsConfig}
   */
  @Prop() config?: SuperTabsConfig;

  /**
   * Initial active tab index.
   * Defaults to `0`.
   *
   * @type {number}
   */
  @Prop({ reflectToAttr: true, mutable: true }) activeTabIndex: number = 0;

  private container!: HTMLSuperTabsContainerElement;
  private toolbar!: HTMLSuperTabsToolbarElement;
  private _config: SuperTabsConfig = DEFAULT_CONFIG;
  private initAttempts: number = 0;
  private readonly initPromise: Promise<void>;
  private initPromiseResolve!: Function;

  constructor() {
    this.initPromise = new Promise<void>((resolve) => {
      this.initPromiseResolve = resolve;
    });
  }

  /**
   * Set/update the configuration
   * @param {SuperTabsConfig} config Configuration object
   */
  @Method()
  async setConfig(config: SuperTabsConfig) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  private propagateConfig() {
    this.container && (this.container.config = this._config);
    this.toolbar && (this.toolbar.config = this._config);
  }

  /**
   * Set the selected tab.
   * This will move the container and the toolbar to the selected tab.
   * @param index {number} the index of the tab you want to select
   * @param [animate=true] {boolean} whether you want to animate the transition
   * @param [emit=true] {boolean} whether you want to emit tab change event
   */
  @Method()
  async selectTab(index: number, animate: boolean = true, emit: boolean = true) {
    this.debug('selectTab', index, animate);

    await this.initPromise;

    const lastIndex = this.activeTabIndex;

    if (this.container) {
      await this.container.setActiveTabIndex(index, true, animate);
    }

    if (this.toolbar) {
      await this.toolbar.setActiveTab(index, true, animate);
    }

    if (emit) {
      this.emitTabChangeEvent(index, lastIndex);
    }

    this.activeTabIndex = lastIndex;
  }

  @Watch('config')
  async onConfigChange(config: SuperTabsConfig) {
    await this.setConfig(config);
  }

  @Listen('resize', { target: 'window', capture: false, passive: true })
  onWindowResize() {
    this.debug('onWindowResize');
    this.toolbar && this.toolbar.setSelectedTab(this.activeTabIndex);
    this.container.reindexTabs();
  }

  async componentWillLoad() {
    if (this.config) {
      await this.setConfig(this.config);
    }
  }

  componentDidLoad() {
    this.debug('componentDidLoad');

    // index children
    this.indexChildren();

    // set the selected tab so the toolbar & container are aligned and in sync

    if (this.activeTabIndex > 0) {
      if (this.container) {
        this.container.setActiveTabIndex(this.activeTabIndex, true, false);
      }

      if (this.toolbar) {
        this.toolbar.setActiveTab(this.activeTabIndex, true, false);
      }
    }

    // listen to `slotchange` event to detect any changes in children
    this.el.shadowRoot!.addEventListener('slotchange', this.onSlotchange.bind(this));

    requestAnimationFrame(() => {
      this.initComponent();
    });
  }

  private initComponent() {
    if (!this.container) {
      if (++this.initAttempts <= maxInitRetries) {
        requestAnimationFrame(() => {
          this.initComponent();
        });
        return;
      } else {
        this.debug(`container still doesn't exists after ${maxInitRetries} frames`);
      }
    }

    if (this.activeTabIndex > 0) {
      if (this.container) {
        this.container.moveContainerByIndex(this.activeTabIndex, false);
      }

      if (this.toolbar) {
        this.toolbar.setActiveTab(this.activeTabIndex, true);
      }
    }

    this.propagateConfig();
    this.setupEventListeners();

    this.initPromiseResolve();
  }

  /**
   * Setup event listeners to synchronize child components
   */
  private async setupEventListeners() {
    if (this.container) {
      await this.container.componentOnReady();
      this.el.addEventListener('selectedTabIndexChange', this.onContainerSelectedTabChange.bind(this));
      this.el.addEventListener('activeTabIndexChange', this.onContainerActiveTabChange.bind(this));
    } else {
      this.debug('setupEventListeners: container does not exist');
    }

    if (this.toolbar) {
      await this.toolbar.componentOnReady();
      this.el.addEventListener('buttonClick', this.onToolbarButtonClick.bind(this));
    } else {
      this.debug('setupEventListeners: toolbar does not exist');
    }
  }

  private async onContainerSelectedTabChange(ev: any) {
    this.debug('onContainerSelectedTabChange called with: ', ev);

    if (this.toolbar) {
      await this.toolbar.setSelectedTab(ev.detail);
    }
  }

  private emitTabChangeEvent(newIndex: number, oldIndex?: number) {
    if (typeof (newIndex as unknown) !== 'number' || newIndex < 0) {
      return;
    }

    if (typeof oldIndex !== 'number' || oldIndex < 0) {
      oldIndex = this.activeTabIndex;
    }

    this.tabChange.emit({
      changed: newIndex !== oldIndex,
      index: newIndex,
    });
  }

  private onContainerActiveTabChange(ev: any) {
    this.debug('onContainerActiveTabChange', ev);
    const index: number = ev.detail;

    this.emitTabChangeEvent(index);

    this.activeTabIndex = index;

    this.toolbar && this.toolbar.setActiveTab(index, true, true);
  }

  private onToolbarButtonClick(ev: any) {
    this.debug('onToolbarButtonClick', ev);

    const { index } = ev.detail;

    this.container && this.container.setActiveTabIndex(index, true, true);

    this.emitTabChangeEvent(index);

    this.activeTabIndex = index;
  }

  private indexChildren() {
    this.debug('indexChildren');

    const container = this.el.querySelector('super-tabs-container');
    const toolbar = this.el.querySelector('super-tabs-toolbar');

    if (container && this.container !== container) {
      this.container = container;
    }

    if (toolbar && this.toolbar !== toolbar) {
      this.toolbar = toolbar;
    }

    this.propagateConfig();
  }

  private async onSlotchange() {
    // re-index the child components
    this.indexChildren();

    // reselect the current tab to ensure that we're on the correct tab
    this.selectTab(this.activeTabIndex, true, false);
  }

  /**
   * Internal method to output values in debug mode.
   */
  private debug(...vals: any[]) {
    debugLog(this._config, 'tabs', vals);
  }

  render() {
    // Render 3 slots
    // Top & bottom slots allow the toolbar position to be configurable via slots.
    // The nameless slot is used to hold the `super-tabs-container`.
    return (
      <Host>
        <slot name="top"/>
        <slot/>
        <slot name="bottom"/>
      </Host>
    );
  }
}
