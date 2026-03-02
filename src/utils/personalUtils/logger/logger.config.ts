/**
 * 1. THE SINGLE SOURCE OF TRUTH CONFIGURATION
 * Developers should come here to explicitly toggle logs on and off.
 * 
 * By defining this as `const`, TypeScript automatically infers the exact 
 * literal types for Services, Components, and Flows based on the keys below.
 */
const INITIAL_CONFIG = {
  // If true, everything logs unless explicitly disabled below.
  // If false, nothing logs unless explicitly enabled below.
  defaultEnabled: false,

  // Manual explicit toggles
  services: {
    AppService: true,
    AuthService: true,
    NetworkService: false,
    PersonalService: false,
    PublicService: false,
    StorageService: false,
    DatabaseService: false,
    NotificationService: false,
  },

  components: {
    ApiClient: false,
    StorageAdapter: false,
    UIComponent: true,
    Navigation: true,
  },

  flows: {
    Initialization: true,
    Login: true,
    Sync: false,
    DeepLink: true,
  },
};

/**
 * 2. AUTOMATICALLY DERIVED TYPES
 * We derive the LogService, LogComponent, and LogFlow types directly from
 * the keys of the `INITIAL_CONFIG` object above.
 */
export type LogService = keyof typeof INITIAL_CONFIG.services;
export type LogComponent = keyof typeof INITIAL_CONFIG.components;
export type LogFlow = keyof typeof INITIAL_CONFIG.flows;

/**
 * 3. MUTABLE RUNTIME CONFIGURATION
 * We clone the initial config so it can be modified at runtime by the manager
 */
export const loggerConfig = {
  defaultEnabled: INITIAL_CONFIG.defaultEnabled,
  services: { ...INITIAL_CONFIG.services } as Record<LogService, boolean>,
  components: { ...INITIAL_CONFIG.components } as Record<LogComponent, boolean>,
  flows: { ...INITIAL_CONFIG.flows } as Record<LogFlow, boolean>,
};

/**
 * 4. RUNTIME TOGGLING MANAGER
 * Useful for debug consoles inside the app to turn logs on/off on the fly
 */
export const LoggerConfigManager = {
  enableService(name: LogService) {
    loggerConfig.services[name] = true;
  },
  disableService(name: LogService) {
    loggerConfig.services[name] = false;
  },
  enableComponent(name: LogComponent) {
    loggerConfig.components[name] = true;
  },
  disableComponent(name: LogComponent) {
    loggerConfig.components[name] = false;
  },
  enableFlow(name: LogFlow) {
    loggerConfig.flows[name] = true;
  },
  disableFlow(name: LogFlow) {
    loggerConfig.flows[name] = false;
  },
  enableAll() {
    loggerConfig.defaultEnabled = true;
  },
  disableAll() {
    loggerConfig.defaultEnabled = false;
  },
};

