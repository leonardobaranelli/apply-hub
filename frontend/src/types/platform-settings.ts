export interface PlatformFormConfig {
  customApplicationMethods?: string[];
  applicationMethodLabels?: Partial<Record<string, string>>;
  applicationMethodOrder?: string[];
  applicationMethodHidden?: string[];
  workModeLabels?: Partial<Record<string, string>>;

  customPositionTypes?: string[];
  positionLabels?: Partial<Record<string, string>>;
  positionOrder?: string[];
  positionHidden?: string[];

  customEmploymentTypes?: string[];
  employmentLabels?: Partial<Record<string, string>>;
  employmentOrder?: string[];
  employmentHidden?: string[];

  customSearchPlatforms?: string[];
  searchPlatformLabels?: Partial<Record<string, string>>;
  searchPlatformOrder?: string[];
  searchPlatformHidden?: string[];

  roleTitleOptions?: string[];
  resumeVersionOptions?: string[];
}

export interface PlatformSettingsDto {
  id: string;
  themeId: string;
  appearanceMode: string;
  formConfig: PlatformFormConfig;
  createdAt: string;
  updatedAt: string;
}
