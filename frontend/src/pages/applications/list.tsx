import { useMemo, useState } from 'react';
import { Briefcase, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { ApplicationFiltersBar } from '@/components/applications/application-filters';
import { ApplicationForm } from '@/components/applications/application-form';
import { ApplicationRow } from '@/components/applications/application-row';
import { PageHeader } from '@/components/layout/page-header';
import {
  useApplicationsList,
  useCreateApplication,
} from '@/hooks/use-applications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type {
  ApplicationFilters,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@/api/applications';

export function ApplicationsListPage() {
  const [filters, setFilters] = useState<ApplicationFilters>({
    page: 1,
    limit: 25,
    sortBy: 'applicationDate',
    sortDir: 'desc',
  });

  const [openCreate, setOpenCreate] = useState(false);
  const createMutation = useCreateApplication();

  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const { data, isLoading } = useApplicationsList(queryFilters);

  const handleCreate = async (
    input: CreateApplicationInput | UpdateApplicationInput,
  ): Promise<void> => {
    await createMutation.mutateAsync(input as CreateApplicationInput);
    setOpenCreate(false);
  };

  return (
    <>
      <PageHeader
        title="Applications"
        description="All your job applications, no matter where they come from."
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus size={16} /> New application
          </Button>
        }
      />

      <div className="space-y-4">
        <ApplicationFiltersBar value={filters} onChange={setFilters} />

        {isLoading ? (
          <PageLoader />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No applications yet"
            description="Start by registering your first application. It only takes seconds: company name, role and method."
            action={
              <Button onClick={() => setOpenCreate(true)}>
                <Plus size={16} /> Create first application
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.meta.total} result{data.meta.total === 1 ? '' : 's'}
              {filters.onlyActive ? ' (active only)' : ''}
            </p>
            <div className="space-y-2">
              {data.data.map((application) => (
                <ApplicationRow
                  key={application.id}
                  application={application}
                />
              ))}
            </div>

            {data.meta.totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page <= 1}
                  onClick={() =>
                    setFilters({ ...filters, page: data.meta.page - 1 })
                  }
                >
                  ← Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {data.meta.page} of {data.meta.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.meta.page >= data.meta.totalPages}
                  onClick={() =>
                    setFilters({ ...filters, page: data.meta.page + 1 })
                  }
                >
                  Next →
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="New application"
        description="Quick capture. Edit any field later from the detail view."
        size="lg"
      >
        <ApplicationForm
          onSubmit={handleCreate}
          onCancel={() => setOpenCreate(false)}
          submitting={createMutation.isPending}
          submitLabel="Create"
        />
      </Modal>
    </>
  );
}
