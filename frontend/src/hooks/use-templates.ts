import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { templatesApi, type CreateTemplateInput } from '@/api/templates';
import type { TemplateType } from '@/types/enums';

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: TemplateType;
  favoritesOnly?: boolean;
  language?: string;
}

export const templateKeys = {
  all: ['templates'] as const,
  list: (params: ListParams) => ['templates', 'list', params] as const,
};

export function useTemplatesList(params: ListParams = {}) {
  return useQuery({
    queryKey: templateKeys.list(params),
    queryFn: () => templatesApi.list(params),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => templatesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.all });
      toast.success('Template created');
    },
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateTemplateInput>) =>
      templatesApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.all });
      toast.success('Template updated');
    },
  });
}

export function useToggleTemplateFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesApi.toggleFavorite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useMarkTemplateUsed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesApi.markUsed(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: templateKeys.all });
      toast.success('Template deleted');
    },
  });
}
