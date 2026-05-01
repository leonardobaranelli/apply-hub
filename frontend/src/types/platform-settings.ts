export interface PlatformFormConfig {
  applicationMethodLabels?: Partial<Record<string, string>>;
  applicationMethodOrder?: string[];
  applicationMethodHidden?: string[];
  workModeLabels?: Partial<Record<string, string>>;
}

export interface PlatformSettingsDto {
  id: string;
  themeId: string;
  formConfig: PlatformFormConfig;
  createdAt: string;
  updatedAt: string;
}
