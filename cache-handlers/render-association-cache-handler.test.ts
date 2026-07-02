const mockSet = jest.fn();
const mockGet = jest.fn();

jest.mock("iovalkey", () =>
	jest.fn().mockImplementation(() => ({ set: mockSet, get: mockGet })),
);

import {
	RenderAssociationType,
	type RenderAssociationValues,
} from "@/lib/render/render-association-types";
import {
	getCurrentScreenCacheEntry,
	getNewAssociationId,
	getRenderAssociatedCacheEntry,
	setCurrentScreenCacheEntry,
	setRenderAssociationCacheEntry,
} from "./render-association-cache-handler";

const EXPIRE_SECONDS = 600;

function makeValues(
	overrides: Partial<RenderAssociationValues> = {},
): RenderAssociationValues {
	return {
		associationId: "test-id",
		type: RenderAssociationType.display,
		imageUrl: "/api/bitmap/test-id.bmp",
		screenId: "my-screen",
		renderHints: {
			width: null,
			height: null,
			modelName: "og_plus",
			paletteId: null,
			orientation: "landscape",
			mimeType: null,
		},
		device: { id: 1, apiKey: "test-api-key" },
		dataParams: null,
		...overrides,
	};
}

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
	jest.restoreAllMocks();
});

beforeEach(() => {
	jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getNewAssociationId
// ---------------------------------------------------------------------------

describe("getNewAssociationId", () => {
	it("returns a non-empty string", () => {
		expect(typeof getNewAssociationId()).toBe("string");
		expect(getNewAssociationId().length).toBeGreaterThan(0);
	});

	it("returns unique values on consecutive calls", () => {
		const ids = Array.from({ length: 10 }, getNewAssociationId);
		expect(new Set(ids).size).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// setRenderAssociationCacheEntry
// ---------------------------------------------------------------------------

describe("setRenderAssociationCacheEntry", () => {
	it("calls cache.set with key render-{associationId}, JSON value, EX, and expiry seconds", () => {
		const values = makeValues({ associationId: "my-id" });
		setRenderAssociationCacheEntry(values);
		expect(mockSet).toHaveBeenCalledWith(
			"render-my-id",
			JSON.stringify(values),
			"EX",
			EXPIRE_SECONDS,
		);
	});

	it("logs the created association", () => {
		const values = makeValues({ associationId: "log-id" });
		setRenderAssociationCacheEntry(values);
		expect(console.log).toHaveBeenCalledWith(
			"Created render association",
			expect.objectContaining({ cacheKey: "render-log-id" }),
		);
	});
});

// ---------------------------------------------------------------------------
// getRenderAssociatedCacheEntry
// ---------------------------------------------------------------------------

describe("getRenderAssociatedCacheEntry", () => {
	it("calls cache.get with key render-{associationId}", async () => {
		mockGet.mockResolvedValue(null);
		await getRenderAssociatedCacheEntry("assoc-123");
		expect(mockGet).toHaveBeenCalledWith("render-assoc-123");
	});

	it("returns null on cache miss", async () => {
		mockGet.mockResolvedValue(null);
		const result = await getRenderAssociatedCacheEntry("missing");
		expect(result).toBeNull();
	});

	it("returns the parsed object on cache hit", async () => {
		const values = makeValues();
		mockGet.mockResolvedValue(JSON.stringify(values));
		const result = await getRenderAssociatedCacheEntry("test-id");
		expect(result).toEqual(values);
	});
});

// ---------------------------------------------------------------------------
// setCurrentScreenCacheEntry
// ---------------------------------------------------------------------------

describe("setCurrentScreenCacheEntry", () => {
	it("calls cache.set with key current-screen-{deviceFriendlyName} and JSON value", () => {
		const values = makeValues();
		setCurrentScreenCacheEntry("my-device", values);
		expect(mockSet).toHaveBeenCalledWith(
			"current-screen-my-device",
			JSON.stringify(values),
		);
	});

	it("does not pass an expiry argument", () => {
		setCurrentScreenCacheEntry("my-device", makeValues());
		expect(mockSet.mock.calls[0]).toHaveLength(2);
	});

	it("logs the assigned current screen", () => {
		setCurrentScreenCacheEntry("my-device", makeValues());
		expect(console.log).toHaveBeenCalledWith(
			"Assigned current screen",
			expect.objectContaining({ cacheKey: "current-screen-my-device" }),
		);
	});
});

// ---------------------------------------------------------------------------
// getCurrentScreenCacheEntry
// ---------------------------------------------------------------------------

describe("getCurrentScreenCacheEntry", () => {
	it("calls cache.get with key current-screen-{deviceFriendlyName}", async () => {
		mockGet.mockResolvedValue(null);
		await getCurrentScreenCacheEntry("friendly-device");
		expect(mockGet).toHaveBeenCalledWith("current-screen-friendly-device");
	});

	it("returns null on cache miss", async () => {
		mockGet.mockResolvedValue(null);
		const result = await getCurrentScreenCacheEntry("unknown");
		expect(result).toBeNull();
	});

	it("returns the parsed object on cache hit", async () => {
		const values = makeValues();
		mockGet.mockResolvedValue(JSON.stringify(values));
		const result = await getCurrentScreenCacheEntry("my-device");
		expect(result).toEqual(values);
	});
});
