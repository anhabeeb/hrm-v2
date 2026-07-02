import { useCallback, useMemo } from "react";
import { api } from "../lib/api";
import { createQueryScope, queryKeys } from "../lib/queryKeys";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { useAuth } from "./useAuth";
import { useReferenceData } from "./useReferenceData";

type OrganizationReferences = {
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
};

export function useOrganizationReferences(token?: string | null) {
  const auth = useAuth();
  const activeToken = token ?? auth.token;
  const fallback = useMemo<OrganizationReferences>(() => ({ departments: [], locations: [], jobLevels: [], positions: [] }), []);
  const scope = useMemo(() => createQueryScope(activeToken, auth.user), [activeToken, auth.user]);
  const load = useCallback(async () => {
    if (!activeToken) return fallback;
    const [departmentRows, locationRows, jobLevelRows, positionRows] = await Promise.all([
      api.listDepartments(activeToken).catch(() => ({ departments: [] })),
      api.listLocations(activeToken).catch(() => ({ locations: [] })),
      api.listJobLevels(activeToken).catch(() => ({ job_levels: [] })),
      api.listPositions(activeToken).catch(() => ({ positions: [] }))
    ]);
    return {
      departments: departmentRows.departments,
      locations: locationRows.locations,
      jobLevels: jobLevelRows.job_levels,
      positions: positionRows.positions
    };
  }, [activeToken, fallback]);

  const { data, loading, error, refresh } = useReferenceData({
    cacheKey: "organization:references",
    queryKey: queryKeys.reference.organization(scope),
    token: activeToken,
    load,
    fallback
  });

  return { ...data, loading, error, refresh };
}
