/**
 * StacksCare Contract Tests
 * Uses Clarinet JS SDK (vitest-based simnet runner)
 * Docs: https://docs.hiro.so/stacks/clarinet-js-sdk
 *
 * @stacks/transactions v7+ string type discriminants:
 *   ResponseOkCV  -> { type: "ok",    value: ClarityValue }
 *   ResponseErrCV -> { type: "err",   value: ClarityValue }
 *   TupleCV       -> { type: "tuple", value: Record<string, CV> }
 *   StringAsciiCV -> { type: "ascii", data: string }
 *   UIntCV        -> { type: "uint",  value: bigint }
 */
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const patient = accounts.get("wallet_1")!;
const doctor = accounts.get("wallet_2")!;
const stranger = accounts.get("wallet_3")!;

const CONTRACT = "stackscare";

/** Assert result is (ok tuple) and return the tuple's data map */
function expectOkTuple(result: any): Record<string, any> {
  expect(result.type).toBe("ok");
  return result.value.value as Record<string, any>;
}

describe("StacksCare Contract", () => {
  describe("create-record", () => {
    it("creates a record and returns record-id u1", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [
          Cl.stringAscii("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
          Cl.stringAscii("consultation"),
        ],
        patient
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("increments record-id for each new record", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash1"), Cl.stringAscii("lab_result")],
        patient
      );
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash2"), Cl.stringAscii("prescription")],
        patient
      );
      expect(result).toBeOk(Cl.uint(2));
    });

    it("rejects empty ipfs-hash", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii(""), Cl.stringAscii("consultation")],
        patient
      );
      expect(result).toBeErr(Cl.uint(103));
    });

    it("rejects empty record-type", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash1"), Cl.stringAscii("")],
        patient
      );
      expect(result).toBeErr(Cl.uint(103));
    });
  });

  describe("get-record", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [
          Cl.stringAscii("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"),
          Cl.stringAscii("consultation"),
        ],
        patient
      );
    });

    it("owner can read their own record with correct fields", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(1)],
        patient
      );
      const data = expectOkTuple(result);
      expect(data["ipfs-hash"].value).toBe("QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
      expect(data["record-type"].value).toBe("consultation");
      expect(Number(data["timestamp"].value)).toBeGreaterThan(0);
    });

    it("unauthorized user cannot read a record", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(1)],
        stranger
      );
      expect(result).toBeErr(Cl.uint(101));
    });

    it("returns error for non-existent record", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(999)],
        patient
      );
      expect(result).toBeErr(Cl.uint(102));
    });
  });

  describe("grant-access & revoke-access", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("lab_result")],
        patient
      );
    });

    it("owner can grant doctor access", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("authorized doctor can read record after grant", () => {
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(1)],
        doctor
      );
      const data = expectOkTuple(result);
      expect(data["ipfs-hash"].value).toBe("QmHash");
      expect(data["record-type"].value).toBe("lab_result");
      expect(Number(data["timestamp"].value)).toBeGreaterThan(0);
    });

    it("non-owner cannot grant access", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        stranger
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("owner cannot grant access to themselves", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(patient)],
        patient
      );
      expect(result).toBeErr(Cl.uint(105));
    });

    it("owner can revoke doctor access", () => {
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("doctor cannot read record after access revoked", () => {
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(1)],
        doctor
      );
      expect(result).toBeErr(Cl.uint(101));
    });
  });

  describe("is-authorized", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("imaging")],
        patient
      );
    });

    it("returns false when doctor is not authorized", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "is-authorized",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeBool(false);
    });

    it("returns true after grant", () => {
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "is-authorized",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeBool(true);
    });
  });

  describe("verify-record", () => {
    it("returns public metadata without requiring authorization", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmVerifyHash"), Cl.stringAscii("prescription")],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "verify-record",
        [Cl.uint(1)],
        stranger // anyone can call verify-record
      );
      const meta = expectOkTuple(result);
      expect(meta["record-type"].value).toBe("prescription");
      expect(Number(meta["timestamp"].value)).toBeGreaterThan(0);
    });

    it("returns error for non-existent record", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "verify-record",
        [Cl.uint(404)],
        stranger
      );
      expect(result).toBeErr(Cl.uint(102));
    });
  });

  describe("get-patient-record-ids", () => {
    it("returns empty list for new patient", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-patient-record-ids",
        [Cl.principal(patient)],
        patient
      );
      expect(result).toBeList([]);
    });

    it("returns all record IDs after creating multiple records", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmA"), Cl.stringAscii("consultation")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmB"), Cl.stringAscii("lab_result")],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-patient-record-ids",
        [Cl.principal(patient)],
        patient
      );
      expect(result).toBeList([Cl.uint(1), Cl.uint(2)]);
    });
  });

  describe("get-total-records", () => {
    it("starts at zero", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-total-records",
        [],
        patient
      );
      expect(result).toBeUint(0);
    });

    it("increments with each new record", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmA"), Cl.stringAscii("consultation")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmB"), Cl.stringAscii("lab_result")],
        doctor
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-total-records",
        [],
        patient
      );
      expect(result).toBeUint(2);
    });
  });

  describe("print events", () => {
    it("create-record emits a record-created event", () => {
      const { events } = simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmEventHash"), Cl.stringAscii("consultation")],
        patient
      );
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event).toBe("print_event");
    });

    it("grant-access emits an access-granted event", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("lab_result")],
        patient
      );
      const { events } = simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event).toBe("print_event");
    });

    it("revoke-access emits an access-revoked event", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("lab_result")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { events } = simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event).toBe("print_event");
    });
  });

  describe("edge cases", () => {
    it("grant-access on non-existent record returns ERR-RECORD-NOT-FOUND", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(999), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeErr(Cl.uint(102));
    });

    it("revoke-access on non-existent record returns ERR-RECORD-NOT-FOUND", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(999), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeErr(Cl.uint(102));
    });

    it("revoke-access succeeds even when access was never granted", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("imaging")],
        patient
      );
      // doctor was never granted access — map-delete is idempotent
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("patient A cannot read patient B's records", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmPatientA"), Cl.stringAscii("prescription")],
        patient
      );
      // stranger (patient B) tries to read patient A's record
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-record",
        [Cl.uint(1)],
        stranger
      );
      expect(result).toBeErr(Cl.uint(101));
    });

    it("each patient has independent record lists", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmA"), Cl.stringAscii("consultation")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmDoc"), Cl.stringAscii("lab_result")],
        doctor
      );

      const { result: patientIds } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-patient-record-ids",
        [Cl.principal(patient)],
        patient
      );
      const { result: doctorIds } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-patient-record-ids",
        [Cl.principal(doctor)],
        doctor
      );

      expect(patientIds).toBeList([Cl.uint(1)]);
      expect(doctorIds).toBeList([Cl.uint(2)]);
    });

    it("get-patient-record-ids returns empty list for address with no records", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-patient-record-ids",
        [Cl.principal(stranger)],
        stranger
      );
      expect(result).toBeList([]);
    });

    it("non-owner cannot revoke access", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("imaging")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        stranger // not the owner
      );
      expect(result).toBeErr(Cl.uint(100));
    });

    it("is-authorized returns false after revoke", () => {
      simnet.callPublicFn(
        CONTRACT,
        "create-record",
        [Cl.stringAscii("QmHash"), Cl.stringAscii("imaging")],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "grant-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      simnet.callPublicFn(
        CONTRACT,
        "revoke-access",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "is-authorized",
        [Cl.uint(1), Cl.principal(doctor)],
        patient
      );
      expect(result).toBeBool(false);
    });
  });
});
