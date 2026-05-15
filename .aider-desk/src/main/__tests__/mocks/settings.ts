import { SettingsData, MemoryEmbeddingProvider } from '@common/types';

/**
 * Creates a minimal mock for SettingsData
 * Provides only the properties needed for testing
 */
export const createMockSettings = (overrides: Partial<SettingsData> = {}): SettingsData => {
  const defaultMock: SettingsData = {
    language: 'en',
    memory: {
      enabled: true,
      provider: MemoryEmbeddingProvider.SentenceTransformers,
      model: 'all-MiniLM-L6-v2',
      maxDistance: 0.5,
    },
  } as SettingsData;

  return { ...defaultMock, ...overrides };
};
