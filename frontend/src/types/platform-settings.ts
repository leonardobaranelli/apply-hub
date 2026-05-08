export interface PlatformFormConfig {
  customApplicationMethods?: string[];
  applicationMethodLabels?: Partial<Record<string, string>>;
  applicationMethodOrder?: string[];
  applicationMethodHidden?: string[];

  customWorkModes?: string[];
  workModeLabels?: Partial<Record<string, string>>;
  workModeOrder?: string[];
  workModeHidden?: string[];

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

  customApplicationStatuses?: string[];
  applicationStatusLabels?: Partial<Record<string, string>>;
  applicationStatusOrder?: string[];
  applicationStatusHidden?: string[];

  customApplicationStages?: string[];
  applicationStageLabels?: Partial<Record<string, string>>;
  applicationStageOrder?: string[];
  applicationStageHidden?: string[];

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
