import { api } from '@/lib/api';
import type {
  PlatformFormConfig,
  PlatformSettingsDto,
} from '@/types/platform-settings';

export interface UpdatePlatformSettingsInput {
  themeId?: string;
  appearanceMode?: string;
  formConfig?: PlatformFormConfig;
}

export const platformSettingsApi = {
  get: async (): Promise<PlatformSettingsDto> => {
    const { data } = await api.get<PlatformSettingsDto>('/platform-settings');
    return data;
  },

  update: async (
    input: UpdatePlatformSettingsInput,
  ): Promise<PlatformSettingsDto> => {
    const { data } = await api.patch<PlatformSettingsDto>(
      '/platform-settings',
      input,
    );
    return data;
  },
};
