import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarFilenameFrom,
  avatarUrlFor,
  avatarsDir,
  contentTypeFor,
  safeFilename,
  uploadsDir,
} from "@/lib/uploads";
import path from "path";

let original: string | undefined;

beforeEach(() => {
  original = process.env.UPLOADS_DIR;
  delete process.env.UPLOADS_DIR;
});

afterEach(() => {
  if (original === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = original;
});

describe("upload paths", () => {
  it("defaults under public/uploads and honours an override", () => {
    expect(uploadsDir()).toBe(path.join(process.cwd(), "public", "uploads"));
    expect(avatarsDir()).toBe(path.join(process.cwd(), "public", "uploads", "avatars"));

    process.env.UPLOADS_DIR = path.join(process.cwd(), "tmp-uploads");
    expect(avatarsDir()).toBe(path.join(process.cwd(), "tmp-uploads", "avatars"));
  });

  it("serves avatars through the path the frontend already proxies", () => {
    expect(avatarUrlFor("org-abc123.png")).toBe("/api/v1/uploads/avatars/org-abc123.png");
  });
});

describe("filename safety", () => {
  it("refuses anything that is not a plain filename", () => {
    for (const bad of [
      "../secret.png",
      "../../etc/passwd",
      "dir/avatar.png",
      "dir\\avatar.png",
      "avatar .png",
      "",
      "avat?r.png",
    ]) {
      expect(safeFilename(bad)).toBeNull();
    }
  });

  it("accepts the names it generates", () => {
    expect(safeFilename("org-abc123.png")).toBe("org-abc123.png");
    expect(safeFilename("default-0a1b2c3d4e5f6789.webp")).toBe("default-0a1b2c3d4e5f6789.webp");
  });
});

describe("avatar url round trip", () => {
  it("recognises a URL this server issued", () => {
    expect(avatarFilenameFrom(avatarUrlFor("org-abc123.png"))).toBe("org-abc123.png");
  });

  it("leaves anything it did not write alone, so it is never deleted", () => {
    expect(avatarFilenameFrom(null)).toBeNull();
    expect(avatarFilenameFrom("https://cdn.example.com/face.png")).toBeNull();
    expect(avatarFilenameFrom("/uploads/avatars/face.png")).toBeNull();
    expect(avatarFilenameFrom("/api/v1/uploads/avatars/../../secret")).toBeNull();
  });
});

describe("avatar content types", () => {
  it("maps every accepted type back from its stored extension", () => {
    expect(contentTypeFor("a.png")).toBe("image/png");
    expect(contentTypeFor("a.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("a.webp")).toBe("image/webp");
  });

  it("refuses an extension it never stores", () => {
    expect(contentTypeFor("a.svg")).toBeNull();
    expect(contentTypeFor("a.gif")).toBeNull();
    expect(contentTypeFor("noext")).toBeNull();
  });

  it("accepts exactly the three image types the UI advertises", () => {
    expect(Object.keys(AVATAR_TYPES).sort()).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(AVATAR_MAX_BYTES).toBe(1024 * 1024);
  });
});
