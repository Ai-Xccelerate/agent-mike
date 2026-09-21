import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarFilenameFrom,
  avatarObjectKey,
  avatarUrlFor,
  avatarsDir,
  contentTypeFor,
  deleteAvatar,
  objectStorageConfig,
  readAvatar,
  safeFilename,
  uploadsDir,
  usesObjectStorage,
  writeAvatar,
} from "@/lib/uploads";
import { rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: class {
      send = sendMock;
    },
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

const BUCKET_ENV = [
  "BUCKET",
  "AWS_S3_BUCKET",
  "ACCESS_KEY_ID",
  "AWS_ACCESS_KEY_ID",
  "SECRET_ACCESS_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "ENDPOINT",
  "AWS_ENDPOINT_URL",
  "REGION",
  "AWS_REGION",
  "UPLOADS_DIR",
] as const;

const savedEnv: Partial<Record<(typeof BUCKET_ENV)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of BUCKET_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  sendMock.mockReset();
});

afterEach(async () => {
  for (const key of BUCKET_ENV) {
    const previous = savedEnv[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  sendMock.mockReset();
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

describe("object storage detection", () => {
  it("falls back to disk when any bucket credential is missing", () => {
    expect(objectStorageConfig()).toBeNull();
    expect(usesObjectStorage()).toBe(false);

    process.env.BUCKET = "bucket";
    process.env.ACCESS_KEY_ID = "key";
    process.env.SECRET_ACCESS_KEY = "secret";
    // ENDPOINT missing
    expect(usesObjectStorage()).toBe(false);
  });

  it("enables object storage when Railway bucket variables are complete", () => {
    process.env.BUCKET = "embedded-cage-hash";
    process.env.ACCESS_KEY_ID = "tid_test";
    process.env.SECRET_ACCESS_KEY = "tsec_test";
    process.env.ENDPOINT = "https://t3.storageapi.dev";
    process.env.REGION = "auto";

    expect(usesObjectStorage()).toBe(true);
    expect(objectStorageConfig()?.bucket).toBe("embedded-cage-hash");
    expect(avatarObjectKey("default-abc.png")).toBe("avatars/default-abc.png");
  });
});

describe("disk fallback write/read/delete", () => {
  it("round-trips an avatar on local disk when the bucket is unset", async () => {
    const dir = path.join(tmpdir(), `avatar-disk-${crypto.randomUUID()}`);
    process.env.UPLOADS_DIR = dir;
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const filename = await writeAvatar("default", bytes, "image/png");
    expect(filename).toMatch(/^default-[a-f0-9]{16}\.png$/);
    expect(sendMock).not.toHaveBeenCalled();

    const read = await readAvatar(filename);
    expect(read?.equals(bytes)).toBe(true);

    await deleteAvatar(filename);
    expect(await readAvatar(filename)).toBeNull();

    await rm(dir, { recursive: true, force: true });
  });
});

describe("object storage write/read/delete", () => {
  beforeEach(() => {
    process.env.BUCKET = "embedded-cage-hash";
    process.env.ACCESS_KEY_ID = "tid_test";
    process.env.SECRET_ACCESS_KEY = "tsec_test";
    process.env.ENDPOINT = "https://t3.storageapi.dev";
  });

  it("puts avatars under avatars/ and returns the relative filename", async () => {
    sendMock.mockResolvedValueOnce({});
    const bytes = Buffer.from("png-bytes");

    const filename = await writeAvatar("default", bytes, "image/png");

    expect(filename).toMatch(/^default-[a-f0-9]{16}\.png$/);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: "embedded-cage-hash",
      Key: `avatars/${filename}`,
      ContentType: "image/png",
      ContentLength: bytes.byteLength,
    });
  });

  it("reads object bodies through the proxy helper", async () => {
    const bytes = Buffer.from("from-bucket");
    sendMock.mockResolvedValueOnce({
      Body: {
        transformToByteArray: async () => new Uint8Array(bytes),
      },
    });

    const read = await readAvatar("default-aaaaaaaaaaaaaaaa.png");
    expect(read?.equals(bytes)).toBe(true);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "embedded-cage-hash",
      Key: "avatars/default-aaaaaaaaaaaaaaaa.png",
    });
  });

  it("maps a missing object to null instead of throwing", async () => {
    sendMock.mockRejectedValueOnce(Object.assign(new Error("missing"), { name: "NoSuchKey" }));
    expect(await readAvatar("default-missing.png")).toBeNull();
  });

  it("deletes the object key for a previous avatar", async () => {
    sendMock.mockResolvedValueOnce({});
    await deleteAvatar("default-bbbbbbbbbbbbbbbb.png");
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "embedded-cage-hash",
      Key: "avatars/default-bbbbbbbbbbbbbbbb.png",
    });
  });
});
