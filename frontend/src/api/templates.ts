import { api, type Paginated } from '@/lib/api';
import type { TemplateType } from '@/types/enums';
import type { Template } from '@/types/models';

export interface CreateTemplateInput {
  name: string;
  type: TemplateType;
  subject?: string;
  body: string;
  language?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export const templatesApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: TemplateType;
    favoritesOnly?: boolean;
  }): Promise<Paginated<Template>> => {
    const { data } = await api.get<Paginated<Template>>('/templates', {
      params,
    });
    return data;
  },
  create: async (input: CreateTemplateInput): Promise<Template> => {
    const { data } = await api.post<Template>('/templates', input);
    return data;
  },
  update: async (
    id: string,
    input: Partial<CreateTemplateInput>,
  ): Promise<Template> => {
    const { data } = await api.patch<Template>(`/templates/${id}`, input);
    return data;
  },
  toggleFavorite: async (id: string): Promise<Template> => {
    const { data } = await api.patch<Template>(`/templates/${id}/favorite`);
    return data;
  },
  markUsed: async (id: string): Promise<Template> => {
    const { data } = await api.patch<Template>(`/templates/${id}/used`);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`);
  },
};
