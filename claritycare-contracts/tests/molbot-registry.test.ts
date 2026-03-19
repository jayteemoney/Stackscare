/**
 * Molbot Registry Contract Tests
 * Uses Clarinet JS SDK (vitest-based simnet runner)
 *
 * Tests agent registration, lookup, update, deregistration,
 * and access-control enforcement.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const agent1 = accounts.get("wallet_1")!;
const agent2 = accounts.get("wallet_2")!;
const stranger = accounts.get("wallet_3")!;

const CONTRACT = "molbot-registry";

/** Helper — register a default medical-ai agent */
function registerMedBot(caller: string = agent1) {
    return simnet.callPublicFn(
        CONTRACT,
        "register-agent",
        [
            Cl.stringAscii("MedAnalyzer"),
            Cl.stringAscii("http://localhost:8000/api/analyze/symptoms"),
            Cl.stringAscii("medical-ai"),
            Cl.uint(10_000), // 0.01 STX = 10,000 µSTX
            Cl.stringAscii("STX"),
        ],
        caller
    );
}

describe("Molbot Registry Contract", () => {
    describe("register-agent", () => {
        it("registers an agent and returns agent-id u1", () => {
            const { result } = registerMedBot();
            expect(result).toBeOk(Cl.uint(1));
        });

        it("increments agent-id for each registration", () => {
            registerMedBot(agent1);
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii("ReportFormatter"),
                    Cl.stringAscii("http://localhost:8000/api/molbot/format"),
                    Cl.stringAscii("report-formatter"),
                    Cl.uint(5_000),
                    Cl.stringAscii("STX"),
                ],
                agent2
            );
            expect(result).toBeOk(Cl.uint(2));
        });

        it("rejects duplicate registration from same principal", () => {
            registerMedBot(agent1);
            const { result } = registerMedBot(agent1);
            expect(result).toBeErr(Cl.uint(202)); // ERR-ALREADY-REGISTERED
        });

        it("rejects empty name", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii(""),
                    Cl.stringAscii("http://localhost:8000"),
                    Cl.stringAscii("medical-ai"),
                    Cl.uint(10_000),
                    Cl.stringAscii("STX"),
                ],
                agent1
            );
            expect(result).toBeErr(Cl.uint(203)); // ERR-INVALID-INPUT
        });

        it("rejects empty endpoint-url", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii("Bot"),
                    Cl.stringAscii(""),
                    Cl.stringAscii("medical-ai"),
                    Cl.uint(10_000),
                    Cl.stringAscii("STX"),
                ],
                agent1
            );
            expect(result).toBeErr(Cl.uint(203));
        });

        it("rejects empty service-type", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii("Bot"),
                    Cl.stringAscii("http://localhost:8000"),
                    Cl.stringAscii(""),
                    Cl.uint(10_000),
                    Cl.stringAscii("STX"),
                ],
                agent1
            );
            expect(result).toBeErr(Cl.uint(203));
        });
    });

    describe("get-agent", () => {
        beforeEach(() => {
            registerMedBot();
        });

        it("returns correct agent data", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent",
                [Cl.uint(1)],
                agent1
            );
            expect(result.type).toBe("ok");
            const data = (result as any).value.value;
            expect(data["name"].value).toBe("MedAnalyzer");
            expect(data["service-type"].value).toBe("medical-ai");
            expect(data["price-ustx"].value).toBe(10_000n);
            expect(data["token-type"].value).toBe("STX");
            expect(data["active"].type).toBe("true");
        });

        it("returns error for non-existent agent", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent",
                [Cl.uint(999)],
                agent1
            );
            expect(result).toBeErr(Cl.uint(201));
        });
    });

    describe("get-agent-by-owner", () => {
        beforeEach(() => {
            registerMedBot();
        });

        it("returns agent for registered owner", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-by-owner",
                [Cl.principal(agent1)],
                agent1
            );
            expect(result.type).toBe("ok");
            const data = (result as any).value.value;
            expect(data["name"].value).toBe("MedAnalyzer");
        });

        it("returns error for unregistered owner", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-by-owner",
                [Cl.principal(stranger)],
                stranger
            );
            expect(result).toBeErr(Cl.uint(201));
        });
    });

    describe("update-agent", () => {
        beforeEach(() => {
            registerMedBot();
        });

        it("owner can update endpoint and price", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "update-agent",
                [
                    Cl.uint(1),
                    Cl.stringAscii("http://newhost:9000/api/analyze"),
                    Cl.uint(20_000),
                ],
                agent1
            );
            expect(result).toBeOk(Cl.bool(true));

            // Verify update
            const { result: agent } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent",
                [Cl.uint(1)],
                agent1
            );
            const data = (agent as any).value.value;
            expect(data["endpoint-url"].value).toBe("http://newhost:9000/api/analyze");
            expect(data["price-ustx"].value).toBe(20_000n);
        });

        it("non-owner cannot update", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "update-agent",
                [
                    Cl.uint(1),
                    Cl.stringAscii("http://evil.com"),
                    Cl.uint(1),
                ],
                stranger
            );
            expect(result).toBeErr(Cl.uint(200)); // ERR-NOT-OWNER
        });
    });

    describe("deregister-agent", () => {
        beforeEach(() => {
            registerMedBot();
        });

        it("owner can deregister (deactivate) their agent", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "deregister-agent",
                [Cl.uint(1)],
                agent1
            );
            expect(result).toBeOk(Cl.bool(true));
        });

        it("agent is inactive after deregistration", () => {
            simnet.callPublicFn(CONTRACT, "deregister-agent", [Cl.uint(1)], agent1);
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "is-agent-active",
                [Cl.uint(1)],
                agent1
            );
            expect(result).toBeBool(false);
        });

        it("non-owner cannot deregister", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "deregister-agent",
                [Cl.uint(1)],
                stranger
            );
            expect(result).toBeErr(Cl.uint(200));
        });
    });

    describe("get-agent-count", () => {
        it("starts at zero", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-count",
                [],
                agent1
            );
            expect(result).toBeUint(0);
        });

        it("increments with registrations", () => {
            registerMedBot(agent1);
            simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii("Formatter"),
                    Cl.stringAscii("http://localhost:8000/format"),
                    Cl.stringAscii("report-formatter"),
                    Cl.uint(5_000),
                    Cl.stringAscii("STX"),
                ],
                agent2
            );
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-count",
                [],
                agent1
            );
            expect(result).toBeUint(2);
        });
    });

    describe("is-agent-active", () => {
        it("returns true for active agent", () => {
            registerMedBot();
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "is-agent-active",
                [Cl.uint(1)],
                agent1
            );
            expect(result).toBeBool(true);
        });

        it("returns false for non-existent agent", () => {
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "is-agent-active",
                [Cl.uint(999)],
                agent1
            );
            expect(result).toBeBool(false);
        });
    });

    describe("print events", () => {
        it("register-agent emits an agent-registered event", () => {
            const { events } = registerMedBot();
            expect(events.length).toBeGreaterThan(0);
            expect(events[0].event).toBe("print_event");
        });

        it("update-agent emits an agent-updated event", () => {
            registerMedBot();
            const { events } = simnet.callPublicFn(
                CONTRACT,
                "update-agent",
                [
                    Cl.uint(1),
                    Cl.stringAscii("http://newhost:9000/api"),
                    Cl.uint(15_000),
                ],
                agent1
            );
            expect(events.length).toBeGreaterThan(0);
            expect(events[0].event).toBe("print_event");
        });

        it("deregister-agent emits an agent-deregistered event", () => {
            registerMedBot();
            const { events } = simnet.callPublicFn(
                CONTRACT,
                "deregister-agent",
                [Cl.uint(1)],
                agent1
            );
            expect(events.length).toBeGreaterThan(0);
            expect(events[0].event).toBe("print_event");
        });
    });

    describe("edge cases", () => {
        it("update-agent on non-existent agent returns ERR-AGENT-NOT-FOUND", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "update-agent",
                [
                    Cl.uint(999),
                    Cl.stringAscii("http://new.endpoint"),
                    Cl.uint(1_000),
                ],
                agent1
            );
            expect(result).toBeErr(Cl.uint(201));
        });

        it("deregister-agent on non-existent agent returns ERR-AGENT-NOT-FOUND", () => {
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "deregister-agent",
                [Cl.uint(999)],
                agent1
            );
            expect(result).toBeErr(Cl.uint(201));
        });

        it("deregistered agent count does not decrease", () => {
            registerMedBot(agent1);
            simnet.callPublicFn(CONTRACT, "deregister-agent", [Cl.uint(1)], agent1);
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-count",
                [],
                agent1
            );
            // Counter tracks total registrations, not active count
            expect(result).toBeUint(1);
        });

        it("get-agent-by-owner still returns agent after deregistration", () => {
            registerMedBot();
            simnet.callPublicFn(CONTRACT, "deregister-agent", [Cl.uint(1)], agent1);
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent-by-owner",
                [Cl.principal(agent1)],
                agent1
            );
            // Agent still exists, just with active: false
            expect(result.type).toBe("ok");
            const data = (result as any).value.value;
            expect(data["active"].type).toBe("false");
        });

        it("allows re-registration after deregistration (owner-agent still blocked)", () => {
            // The contract tracks owner→agent mapping permanently, so a second
            // register from the same principal must still fail
            registerMedBot(agent1);
            simnet.callPublicFn(CONTRACT, "deregister-agent", [Cl.uint(1)], agent1);
            const { result } = registerMedBot(agent1);
            expect(result).toBeErr(Cl.uint(202)); // ERR-ALREADY-REGISTERED
        });

        it("different agents can have different service types", () => {
            registerMedBot(agent1);
            simnet.callPublicFn(
                CONTRACT,
                "register-agent",
                [
                    Cl.stringAscii("Formatter"),
                    Cl.stringAscii("http://localhost:8000/format"),
                    Cl.stringAscii("report-formatter"),
                    Cl.uint(5_000),
                    Cl.stringAscii("STX"),
                ],
                agent2
            );

            const { result: a1 } = simnet.callReadOnlyFn(
                CONTRACT, "get-agent", [Cl.uint(1)], agent1
            );
            const { result: a2 } = simnet.callReadOnlyFn(
                CONTRACT, "get-agent", [Cl.uint(2)], agent1
            );

            const d1 = (a1 as any).value.value;
            const d2 = (a2 as any).value.value;
            expect(d1["service-type"].value).toBe("medical-ai");
            expect(d2["service-type"].value).toBe("report-formatter");
        });

        it("update-agent rejects empty endpoint-url", () => {
            registerMedBot();
            const { result } = simnet.callPublicFn(
                CONTRACT,
                "update-agent",
                [Cl.uint(1), Cl.stringAscii(""), Cl.uint(10_000)],
                agent1
            );
            expect(result).toBeErr(Cl.uint(203));
        });

        it("agent data includes owner principal after registration", () => {
            registerMedBot();
            const { result } = simnet.callReadOnlyFn(
                CONTRACT,
                "get-agent",
                [Cl.uint(1)],
                agent1
            );
            expect(result.type).toBe("ok");
            // owner field should be the registering principal
            const data = (result as any).value.value;
            expect(data["owner"]).toBeDefined();
        });
    });
});
