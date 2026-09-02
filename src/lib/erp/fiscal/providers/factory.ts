import { FiscalProvider } from './contract';
import { TestFiscalProvider } from './test-provider';
import { FocusNFeProvider } from './focus-provider';

export function getFiscalProvider(providerCode: string, environment: 'homologation' | 'production'): FiscalProvider {
  if (providerCode === 'test_mock') {
    if (environment === 'production') {
      throw new Error('FATAL: TestFiscalProvider is strictly blocked in production environment.');
    }
    return new TestFiscalProvider();
  }

  switch (providerCode) {
    case 'focus_nfe':
      return new FocusNFeProvider();
    case 'nuvem_fiscal':
      throw new Error('NuvemFiscalProvider not implemented yet (Block 4C).');
    case 'plugnotas':
      throw new Error('PlugNotasProvider not implemented yet (Block 4C).');
    default:
      throw new Error(`Unsupported fiscal provider: ${providerCode}`);
  }
}