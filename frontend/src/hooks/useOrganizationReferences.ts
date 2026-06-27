import { useCallback, useMemo } from "react";
import { api } from "../lib/api";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { useReferenceData } from "./useReferenceData";

type OrganizationReferences = {
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
};

export function useOrganizationReferences(token?: string | null) {
  const fallback = useMemo<OrganizationReferences>(() => ({ departments: [], locations: [], jobLevels: [], positions: [] }), []);
  const load = useCallback(async () => {
    if (!token) return fallback;
    const [departmentRows, locationRows, jobLevelRows, positionRows] = await Promise.all([
      api.listDepartments(token).catch(() => ({ departments: [] })),
      api.listLocations(token).catch(() => ({ locations: [] })),
      api.listJobLevels(token).catch(() => ({ job_levels: [] })),
      api.listPositions(token).catch(() => ({ positions: [] }))
    ]);
    return {
      departments: departmentRows.departments,
      locations: locationRows.locations,
      jobLevels: jobLevelRows.job_levels,
      positions: positionRows.positions
    };
  }, [fallback, token]);

  const { data, loading, error, refresh } = useReferenceData({
    cacheKey: "organization:references",
    token,
    load,
    fallback
  });

  return { ...data, loading, error, refresh };
}
