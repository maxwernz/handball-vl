import type { Filters } from '../scope.ts';
export interface ViewProps { f: Filters; setFilters: (patch: Partial<Filters>) => void }
