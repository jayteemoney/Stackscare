"use client";

/**
 * useHealthRecords — hook for fetching and managing health records
 * from the StacksCare Clarity smart contract.
 */

import { useState, useEffect, useCallback } from "react";
import {
  fetchPatientRecordIds,
  fetchRecord,
  callCreateRecord,
  callGrantAccess,
  callRevokeAccess,
} from "@/lib/stacks";
import type { HealthRecord, RecordType } from "@/types";

export function useHealthRecords(address: string | null) {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!address) {
      setRecords([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ids = await fetchPatientRecordIds(address);
      const fetched = await Promise.all(
        ids.map(async (id) => {
          const rec = await fetchRecord(id, address);
          if (!rec) return null;
          return {
            recordId: id,
            owner: rec.owner,
            ipfsHash: rec.ipfsHash,
            recordType: rec.recordType as RecordType,
            timestamp: rec.timestamp,
          } satisfies HealthRecord;
        })
      );
      setRecords(fetched.filter(Boolean) as HealthRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const createRecord = useCallback(
    (
      ipfsHash: string,
      recordType: RecordType,
      onFinish: (txId: string) => void,
      onCancel: () => void
    ) => {
      callCreateRecord(ipfsHash, recordType, onFinish, onCancel);
    },
    []
  );

  const grantAccess = useCallback(
    (
      recordId: number,
      doctorAddress: string,
      onFinish: (txId: string) => void,
      onCancel: () => void
    ) => {
      callGrantAccess(recordId, doctorAddress, onFinish, onCancel);
    },
    []
  );

  const revokeAccess = useCallback(
    (
      recordId: number,
      doctorAddress: string,
      onFinish: (txId: string) => void,
      onCancel: () => void
    ) => {
      callRevokeAccess(recordId, doctorAddress, onFinish, onCancel);
    },
    []
  );

  return {
    records,
    isLoading,
    error,
    refresh: loadRecords,
    createRecord,
    grantAccess,
    revokeAccess,
  };
}
