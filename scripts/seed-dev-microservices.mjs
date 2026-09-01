import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const { Client } = require(path.join(repositoryRoot, "services", "shared", "node_modules", "pg"));
const dotenv = require(path.join(repositoryRoot, "services", "shared", "node_modules", "dotenv"));

dotenv.config({ path: path.join(repositoryRoot, ".env") });

const developmentPassword = "RentMateDev123!";
const developmentPasswordHash = "$2b$10$Ud5SkkcShNSYVQ/ZwEP/i.ieCIr2a4Z1EazYD4OmfSdSqReIa1quC";
const demoListingImageUrls = Object.freeze([
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=85",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=85",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=85",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=85"
]);

const demoUsers = Object.freeze([
  { key: "admin", role: "ADMIN", displayName: "Admin RentMate", email: "demo.admin@rentmate.local", phone: null },
  {
    key: "landlord1",
    role: "LANDLORD",
    displayName: "Nguyen Minh Anh",
    email: "demo.landlord1@rentmate.local",
    phone: "+84970000001"
  },
  {
    key: "landlord2",
    role: "LANDLORD",
    displayName: "Tran Hoang Nam",
    email: "demo.landlord2@rentmate.local",
    phone: "+84970000002"
  },
  {
    key: "landlord3",
    role: "LANDLORD",
    displayName: "Le Thao Nguyen",
    email: "demo.landlord3@rentmate.local",
    phone: "+84970000003"
  },
  {
    key: "tenant1",
    role: "TENANT",
    displayName: "Pham Gia Huy",
    email: "demo.tenant@rentmate.local",
    phone: "+84980000001"
  },
  {
    key: "tenant2",
    role: "TENANT",
    displayName: "Vo Khanh Linh",
    email: "demo.tenant2@rentmate.local",
    phone: "+84980000002"
  },
  {
    key: "tenant3",
    role: "TENANT",
    displayName: "Do Quoc Bao",
    email: "demo.tenant3@rentmate.local",
    phone: "+84980000003"
  },
  {
    key: "tenant4",
    role: "TENANT",
    displayName: "Nguyen Thu Ha",
    email: "demo.tenant4@rentmate.local",
    phone: "+84980000004"
  }
]);

const listingSeeds = Object.freeze([
  {
    code: "demo-approved-room-1",
    owner: "landlord1",
    status: "APPROVED",
    businessStatus: "AVAILABLE",
    title: "Phong full noi that gan Dai hoc Kinh te",
    description: "Phong sang, day du noi that, phu hop sinh vien va nguoi di lam tai Quan 3.",
    monthlyRent: 4_200_000,
    roomAreaSqm: 24,
    maxOccupants: 2,
    addressText: "123 Nguyen Dinh Chieu, Phuong Vo Thi Sau",
    areaName: "Quan 3",
    latitude: 10.7753,
    longitude: 106.6861,
    propertyType: "ROOM",
    amenities: ["AIR_CONDITIONING", "WIFI", "FURNISHED", "PRIVATE_BATHROOM", "PARKING"]
  },
  {
    code: "demo-approved-studio-1",
    owner: "landlord1",
    status: "APPROVED",
    businessStatus: "AVAILABLE",
    title: "Studio co ban cong tai Binh Thanh",
    description: "Studio co ban cong thoang, co bep rieng va bao ve 24/7, di chuyen thuan tien.",
    monthlyRent: 6_500_000,
    roomAreaSqm: 32,
    maxOccupants: 2,
    addressText: "45 Nguyen Cuu Van, Phuong 17",
    areaName: "Binh Thanh",
    latitude: 10.8012,
    longitude: 106.7114,
    propertyType: "STUDIO",
    amenities: ["AIR_CONDITIONING", "WIFI", "KITCHEN", "BALCONY", "SECURITY"]
  },
  {
    code: "demo-approved-apartment-1",
    owner: "landlord2",
    status: "APPROVED",
    businessStatus: "RENTED",
    title: "Can ho mini yen tinh o Thao Dien",
    description: "Can ho mini co thang may, noi that dep va khu dan cu yen tinh gan song Sai Gon.",
    monthlyRent: 8_500_000,
    roomAreaSqm: 38,
    maxOccupants: 3,
    addressText: "18 Duong 41, Phuong Thao Dien",
    areaName: "Thu Duc",
    latitude: 10.8038,
    longitude: 106.7342,
    propertyType: "APARTMENT",
    amenities: ["AIR_CONDITIONING", "WIFI", "FURNISHED", "KITCHEN", "ELEVATOR", "PARKING"]
  },
  {
    code: "demo-approved-room-2",
    owner: "landlord2",
    status: "APPROVED",
    businessStatus: "PAUSED",
    title: "Phong gia mem gan Khu Cong nghe cao",
    description: "Phong gia mem, co cho de xe va gio giac tu do, phu hop nguoi di lam.",
    monthlyRent: 3_500_000,
    roomAreaSqm: 20,
    maxOccupants: 1,
    addressText: "72 Le Van Viet, Phuong Tang Nhon Phu A",
    areaName: "Thu Duc",
    latitude: 10.8424,
    longitude: 106.7872,
    propertyType: "ROOM",
    amenities: ["WIFI", "PRIVATE_BATHROOM", "PARKING", "SECURITY"]
  },
  {
    code: "demo-approved-studio-2",
    owner: "landlord3",
    status: "APPROVED",
    businessStatus: "UNKNOWN",
    title: "Studio co gac gan san bay",
    description: "Studio co gac nho, day du tien nghi, phu hop o mot nguoi hoac hai nguoi.",
    monthlyRent: 5_200_000,
    roomAreaSqm: 28,
    maxOccupants: 2,
    addressText: "9 Bach Dang, Phuong 2",
    areaName: "Tan Binh",
    latitude: 10.8125,
    longitude: 106.6658,
    propertyType: "STUDIO",
    amenities: ["AIR_CONDITIONING", "WIFI", "FURNISHED", "PRIVATE_BATHROOM", "REFRIGERATOR"]
  },
  {
    code: "demo-pending-room-1",
    owner: "landlord1",
    status: "PENDING",
    businessStatus: "AVAILABLE",
    title: "Phong moi dang cho duyet tai Phu Nhuan",
    description: "Tin dang nay dang cho admin kiem tra thong tin va hinh anh.",
    monthlyRent: 4_800_000,
    roomAreaSqm: 25,
    maxOccupants: 2,
    addressText: "26 Phan Dinh Phung, Phuong 2",
    areaName: "Phu Nhuan",
    latitude: 10.7984,
    longitude: 106.6807,
    propertyType: "ROOM",
    amenities: ["AIR_CONDITIONING", "WIFI", "PRIVATE_BATHROOM"]
  },
  {
    code: "demo-rejected-room-1",
    owner: "landlord2",
    status: "REJECTED",
    businessStatus: "UNKNOWN",
    title: "Tin dang can bo sung thong tin",
    description: "Tin dang mau de kiem tra giao dien hien thi ly do tu choi.",
    monthlyRent: 4_000_000,
    roomAreaSqm: 22,
    maxOccupants: 2,
    addressText: "88 Cach Mang Thang Tam, Phuong 5",
    areaName: "Tan Binh",
    latitude: 10.7896,
    longitude: 106.6662,
    propertyType: "ROOM",
    amenities: ["WIFI", "PARKING"]
  },
  {
    code: "demo-hidden-room-1",
    owner: "landlord3",
    status: "HIDDEN",
    businessStatus: "PAUSED",
    title: "Tin dang dang tam an khoi ket qua",
    description: "Tin dang mau de kiem tra trang thai bi an va lich su moderation.",
    monthlyRent: 4_600_000,
    roomAreaSqm: 23,
    maxOccupants: 2,
    addressText: "14 Nguyen Van Troi, Phuong 15",
    areaName: "Phu Nhuan",
    latitude: 10.7989,
    longitude: 106.6775,
    propertyType: "ROOM",
    amenities: ["AIR_CONDITIONING", "WIFI", "PRIVATE_BATHROOM"]
  },
  {
    code: "demo-inactive-room-1",
    owner: "landlord3",
    status: "INACTIVE",
    businessStatus: "RENTED",
    title: "Phong dang tam dung nhan khach",
    description: "Tin dang mau de kiem tra trang thai landlord tam dung nhan lien he.",
    monthlyRent: 5_000_000,
    roomAreaSqm: 26,
    maxOccupants: 2,
    addressText: "31 Hoang Van Thu, Phuong 4",
    areaName: "Tan Binh",
    latitude: 10.8004,
    longitude: 106.6627,
    propertyType: "ROOM",
    amenities: ["AIR_CONDITIONING", "WIFI", "PARKING"]
  },
  {
    code: "demo-draft-room-1",
    owner: "landlord2",
    status: "DRAFT",
    businessStatus: "UNKNOWN",
    title: "Ban nhap tin dang chua hoan tat",
    description: "Ban nhap mau de landlord tiep tuc chinh sua truoc khi gui duyet.",
    monthlyRent: 5_700_000,
    roomAreaSqm: 30,
    maxOccupants: 3,
    addressText: "102 Vo Van Tan, Phuong 6",
    areaName: "Quan 3",
    latitude: 10.7737,
    longitude: 106.6822,
    propertyType: "STUDIO",
    amenities: ["AIR_CONDITIONING", "WIFI"]
  }
]);

function databaseConfig(database) {
  const nodeEnvironment = process.env.NODE_ENV;
  if (nodeEnvironment !== "development") {
    throw new Error("Seed development chi duoc chay khi NODE_ENV=development.");
  }

  const host = process.env.SEED_DB_HOST ?? process.env.DB_HOST ?? "localhost";
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Seed development chi cho phep ket noi den PostgreSQL local.");
  }

  const port = Number(process.env.SEED_DB_PORT ?? process.env.DB_PORT ?? 5432);
  const user = process.env.SEED_DB_USER ?? process.env.POSTGRES_USER ?? process.env.DB_USER ?? "rentmate";
  const password = process.env.SEED_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD;
  if (!password) throw new Error("Khong tim thay mat khau PostgreSQL local.");

  return { host, port, user, password, database };
}

async function connect(database) {
  const client = new Client(databaseConfig(database));
  await client.connect();
  return client;
}

async function transaction(client, operation) {
  await client.query("BEGIN");
  try {
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function idsOrSentinel(ids) {
  return ids.length > 0 ? ids : [0];
}

function userMap(rows) {
  return new Map(rows.map((row) => [row.email, Number(row.id)]));
}

async function seedIdentity() {
  const client = await connect("rentmate_identity");
  try {
    return await transaction(client, async (executor) => {
      const values = [];
      const placeholders = demoUsers.map((user, index) => {
        const offset = index * 6;
        values.push(user.role, user.displayName, user.email, user.phone, developmentPasswordHash, true);
        return `(
          $${offset + 1}::user_role, $${offset + 2}, $${offset + 3}, $${offset + 4}::varchar(16), $${offset + 5}, $${offset + 6},
          CURRENT_TIMESTAMP, CASE WHEN $${offset + 4}::varchar(16) IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
        )`;
      });
      const users = await executor.query(
        `
          INSERT INTO users (
            role, display_name, email, phone_e164, password_hash, is_active, email_verified_at, phone_verified_at
          )
          VALUES ${placeholders.join(", ")}
          ON CONFLICT (email) DO UPDATE SET
            role = EXCLUDED.role,
            display_name = EXCLUDED.display_name,
            phone_e164 = EXCLUDED.phone_e164,
            password_hash = EXCLUDED.password_hash,
            is_active = EXCLUDED.is_active,
            email_verified_at = CURRENT_TIMESTAMP,
            phone_verified_at = CASE WHEN EXCLUDED.phone_e164 IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id, email, role
        `,
        values
      );
      const idsByEmail = userMap(users.rows);
      const adminId = idsByEmail.get("demo.admin@rentmate.local");
      const landlordIds = [
        idsByEmail.get("demo.landlord1@rentmate.local"),
        idsByEmail.get("demo.landlord2@rentmate.local"),
        idsByEmail.get("demo.landlord3@rentmate.local")
      ];
      const tenantIds = [
        idsByEmail.get("demo.tenant@rentmate.local"),
        idsByEmail.get("demo.tenant2@rentmate.local"),
        idsByEmail.get("demo.tenant3@rentmate.local"),
        idsByEmail.get("demo.tenant4@rentmate.local")
      ];
      if (!adminId || landlordIds.some((id) => !id) || tenantIds.some((id) => !id)) {
        throw new Error("Khong tao duoc tai khoan demo Identity.");
      }

      await executor.query("DELETE FROM landlord_verifications WHERE landlord_id = ANY($1::integer[])", [landlordIds]);
      await executor.query(
        `
          INSERT INTO landlord_verifications (
            landlord_id, display_name, request_note, status, decision_note, reviewed_by_admin_id, reviewed_at
          ) VALUES
            ($1, 'Nguyen Minh Anh', 'Ho so mau da duoc xac minh.', 'APPROVED', 'Ho so demo hop le.', $4, CURRENT_TIMESTAMP),
            ($2, 'Tran Hoang Nam', 'Ho so mau dang cho admin xem xet.', 'PENDING', NULL, NULL, NULL),
            ($3, 'Le Thao Nguyen', 'Ho so mau can bo sung thong tin.', 'REJECTED', 'Vui long bo sung thong tin lien he.', $4, CURRENT_TIMESTAMP)
        `,
        [landlordIds[0], landlordIds[1], landlordIds[2], adminId]
      );

      return {
        adminId,
        landlordIds,
        tenantIds,
        idsByEmail
      };
    });
  } finally {
    await client.end();
  }
}

async function existingDemoListingIds(landlordIds) {
  const client = await connect("rentmate_listing");
  try {
    const result = await client.query("SELECT id FROM listings WHERE landlord_id = ANY($1::integer[]) ORDER BY id", [
      landlordIds
    ]);
    return result.rows.map((row) => Number(row.id));
  } finally {
    await client.end();
  }
}

async function cleanEngagement(demo, listingIds) {
  const client = await connect("rentmate_engagement");
  try {
    await transaction(client, async (executor) => {
      const allUserIds = [...demo.landlordIds, ...demo.tenantIds, demo.adminId];
      const allUserIdsParam = idsOrSentinel(allUserIds);
      const listingIdsParam = idsOrSentinel(listingIds);

      await executor.query(
        `
          WITH demo_requests AS (
            SELECT id FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[])
          ), demo_interests AS (
            SELECT i.id FROM roommate_interests i
            WHERE i.request_id IN (SELECT id FROM demo_requests)
               OR i.interested_tenant_id = ANY($1::integer[])
          )
          DELETE FROM notifications
          WHERE recipient_id = ANY($1::integer[])
             OR roommate_request_id IN (SELECT id FROM demo_requests)
             OR roommate_interest_id IN (SELECT id FROM demo_interests)
        `,
        [demo.tenantIds]
      );
      await executor.query(
        `
          WITH demo_requests AS (
            SELECT id FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[])
          ), demo_interests AS (
            SELECT i.id FROM roommate_interests i
            WHERE i.request_id IN (SELECT id FROM demo_requests)
               OR i.interested_tenant_id = ANY($1::integer[])
          ), demo_messages AS (
            SELECT id FROM roommate_messages WHERE interest_id IN (SELECT id FROM demo_interests)
          ), demo_reports AS (
            SELECT id FROM contact_reports
            WHERE source = 'ROOMMATE'
              AND (
                reporter_id = ANY($1::integer[])
                OR roommate_request_id IN (SELECT id FROM demo_requests)
                OR roommate_message_id IN (SELECT id FROM demo_messages)
              )
          )
          DELETE FROM contact_report_events WHERE report_id IN (SELECT id FROM demo_reports)
        `,
        [demo.tenantIds]
      );
      await executor.query(
        `
          WITH demo_requests AS (
            SELECT id FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[])
          ), demo_interests AS (
            SELECT i.id FROM roommate_interests i
            WHERE i.request_id IN (SELECT id FROM demo_requests)
               OR i.interested_tenant_id = ANY($1::integer[])
          ), demo_messages AS (
            SELECT id FROM roommate_messages WHERE interest_id IN (SELECT id FROM demo_interests)
          )
          DELETE FROM contact_reports
          WHERE source = 'ROOMMATE'
            AND (
              reporter_id = ANY($1::integer[])
              OR roommate_request_id IN (SELECT id FROM demo_requests)
              OR roommate_message_id IN (SELECT id FROM demo_messages)
            )
        `,
        [demo.tenantIds]
      );
      await executor.query(
        `
          DELETE FROM contact_blocks
          WHERE roommate_request_id IS NOT NULL
            AND (
              blocker_id = ANY($1::integer[])
              OR blocked_id = ANY($1::integer[])
              OR roommate_request_id IN (
                SELECT id FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[])
              )
            )
        `,
        [demo.tenantIds]
      );
      await executor.query(
        `
          DELETE FROM roommate_messages
          WHERE interest_id IN (
            SELECT i.id FROM roommate_interests i
            JOIN roommate_requests r ON r.id = i.request_id
            WHERE r.owner_tenant_id = ANY($1::integer[]) OR i.interested_tenant_id = ANY($1::integer[])
          )
        `,
        [demo.tenantIds]
      );
      await executor.query(
        `
          DELETE FROM roommate_interests
          WHERE request_id IN (SELECT id FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[]))
             OR interested_tenant_id = ANY($1::integer[])
        `,
        [demo.tenantIds]
      );
      await executor.query("DELETE FROM roommate_requests WHERE owner_tenant_id = ANY($1::integer[])", [
        demo.tenantIds
      ]);
      await executor.query("DELETE FROM roommate_profiles WHERE tenant_id = ANY($1::integer[])", [demo.tenantIds]);

      await executor.query(
        `
          WITH demo_inquiries AS (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($3::integer[])
               OR landlord_id = ANY($4::integer[])
               OR listing_id = ANY($5::integer[])
          )
          DELETE FROM notifications
          WHERE recipient_id = ANY($1::integer[])
             OR listing_id = ANY($2::integer[])
             OR inquiry_id IN (SELECT id FROM demo_inquiries)
        `,
        [allUserIdsParam, listingIdsParam, demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        `
          WITH demo_inquiries AS (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($3::integer[])
               OR landlord_id = ANY($4::integer[])
               OR listing_id = ANY($5::integer[])
          )
          DELETE FROM listing_reviews
          WHERE tenant_id = ANY($1::integer[])
             OR listing_id = ANY($2::integer[])
             OR inquiry_id IN (SELECT id FROM demo_inquiries)
        `,
        [demo.tenantIds, listingIdsParam, demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        "DELETE FROM tenant_listing_notes WHERE tenant_id = ANY($1::integer[]) OR listing_id = ANY($2::integer[])",
        [demo.tenantIds, listingIdsParam]
      );
      await executor.query(
        "DELETE FROM favorites WHERE tenant_id = ANY($1::integer[]) OR listing_id = ANY($2::integer[])",
        [demo.tenantIds, listingIdsParam]
      );
      await executor.query("DELETE FROM saved_searches WHERE tenant_id = ANY($1::integer[])", [demo.tenantIds]);
      await executor.query(
        `
          WITH demo_inquiries AS (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($1::integer[])
               OR landlord_id = ANY($2::integer[])
               OR listing_id = ANY($3::integer[])
          )
          DELETE FROM contact_report_events
          WHERE report_id IN (SELECT id FROM contact_reports WHERE inquiry_id IN (SELECT id FROM demo_inquiries))
        `,
        [demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        `
          DELETE FROM contact_reports
          WHERE inquiry_id IN (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($1::integer[]) OR landlord_id = ANY($2::integer[]) OR listing_id = ANY($3::integer[])
          )
        `,
        [demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        `
          WITH demo_inquiries AS (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($2::integer[])
               OR landlord_id = ANY($3::integer[])
               OR listing_id = ANY($4::integer[])
          )
          DELETE FROM landlord_lead_notes
          WHERE landlord_id = ANY($1::integer[])
             OR inquiry_id IN (SELECT id FROM demo_inquiries)
        `,
        [demo.landlordIds, demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        `
          WITH demo_inquiries AS (
            SELECT id FROM listing_inquiries
            WHERE tenant_id = ANY($2::integer[])
               OR landlord_id = ANY($3::integer[])
               OR listing_id = ANY($4::integer[])
          )
          DELETE FROM landlord_lead_reminders
          WHERE landlord_id = ANY($1::integer[])
             OR inquiry_id IN (SELECT id FROM demo_inquiries)
        `,
        [demo.landlordIds, demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
      await executor.query(
        `DELETE FROM listing_inquiries WHERE tenant_id = ANY($1::integer[]) OR landlord_id = ANY($2::integer[]) OR listing_id = ANY($3::integer[])`,
        [demo.tenantIds, demo.landlordIds, listingIdsParam]
      );
    });
  } finally {
    await client.end();
  }
}

async function seedListing(demo, existingListingIds) {
  const client = await connect("rentmate_listing");
  try {
    return await transaction(client, async (executor) => {
      const listingIdsParam = idsOrSentinel(existingListingIds);
      await executor.query(
        `
          DELETE FROM listing_report_events
          WHERE report_id IN (SELECT id FROM listing_reports WHERE listing_id = ANY($1::integer[]))
        `,
        [listingIdsParam]
      );
      await executor.query("DELETE FROM listing_reports WHERE listing_id = ANY($1::integer[])", [listingIdsParam]);
      await executor.query("DELETE FROM moderation_history WHERE listing_id = ANY($1::integer[])", [listingIdsParam]);
      await executor.query("DELETE FROM listings WHERE landlord_id = ANY($1::integer[])", [demo.landlordIds]);

      const propertyTypes = await executor.query("SELECT id, code FROM property_types");
      const amenities = await executor.query("SELECT id, code FROM amenities");
      const propertyTypeIds = new Map(propertyTypes.rows.map((row) => [row.code, Number(row.id)]));
      const amenityIds = new Map(amenities.rows.map((row) => [row.code, Number(row.id)]));
      const listingIds = new Map();
      const moderationHistoryIds = new Map();

      for (const [index, listing] of listingSeeds.entries()) {
        const landlordId = demo.idsByEmail.get(
          `${listing.owner === "landlord1" ? "demo.landlord1" : listing.owner === "landlord2" ? "demo.landlord2" : "demo.landlord3"}@rentmate.local`
        );
        const propertyTypeId = propertyTypeIds.get(listing.propertyType);
        if (!landlordId || !propertyTypeId) throw new Error(`Lookup seed listing khong hop le: ${listing.code}`);

        const inserted = await executor.query(
          `
            INSERT INTO listings (
              landlord_id, property_type_id, status, business_status, title, description, monthly_rent, room_area_sqm,
              max_occupants, availability_confirmed_at, address_text, area_name, latitude, longitude
            ) VALUES ($1, $2, $3::listing_status, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
          `,
          [
            landlordId,
            propertyTypeId,
            listing.status,
            listing.businessStatus,
            listing.title,
            listing.description,
            listing.monthlyRent,
            listing.roomAreaSqm,
            listing.maxOccupants,
            listing.status === "APPROVED" ? new Date() : null,
            listing.addressText,
            listing.areaName,
            listing.latitude,
            listing.longitude
          ]
        );
        const listingId = Number(inserted.rows[0].id);
        listingIds.set(listing.code, listingId);

        for (const amenityCode of listing.amenities) {
          const amenityId = amenityIds.get(amenityCode);
          if (!amenityId) throw new Error(`Amenity seed listing khong hop le: ${amenityCode}`);
          await executor.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [
            listingId,
            amenityId
          ]);
        }

        await executor.query(
          `
            INSERT INTO listing_images (
              listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text
            ) VALUES ($1, $2, $3, 'png', 1200, 800, 15000, 1, $4)
          `,
          [
            listingId,
            `demo/seed/${listing.code}`,
            demoListingImageUrls[index % demoListingImageUrls.length],
            `Anh demo cho ${listing.title}`
          ]
        );

        const historyTransition = {
          APPROVED: ["PENDING", null],
          REJECTED: ["PENDING", "Can bo sung thong tin dia chi va gia thue."],
          HIDDEN: ["APPROVED", "Tin dang can cap nhat lai trang thai con phong."]
        }[listing.status];
        if (historyTransition) {
          const history = await executor.query(
            `
              INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason)
              VALUES ($1, $2, $3::listing_status, $4::listing_status, $5)
              RETURNING id
            `,
            [listingId, demo.adminId, historyTransition[0], listing.status, historyTransition[1]]
          );
          moderationHistoryIds.set(listing.code, Number(history.rows[0].id));
        }
      }

      const reportIds = [];
      const openReport = await executor.query(
        `
          INSERT INTO listing_reports (listing_id, reporter_id, category, details)
          VALUES ($1, $2, 'PRICE_INCORRECT', 'Gia trong tin demo de kiem tra hang doi bao cao.')
          RETURNING id
        `,
        [listingIds.get("demo-approved-room-1"), demo.tenantIds[0]]
      );
      reportIds.push(Number(openReport.rows[0].id));
      await executor.query(
        `
          INSERT INTO listing_report_events (report_id, actor_id, actor_role, previous_status, new_status, note)
          VALUES ($1, $2, 'TENANT', NULL, 'OPEN', NULL)
        `,
        [reportIds[0], demo.tenantIds[0]]
      );

      const investigatingReport = await executor.query(
        `
          INSERT INTO listing_reports (listing_id, reporter_id, category, details, status, assigned_admin_id)
          VALUES ($1, $2, 'IMAGE_INCORRECT', 'Anh demo can admin kiem tra lai.', 'INVESTIGATING', $3)
          RETURNING id
        `,
        [listingIds.get("demo-approved-studio-1"), demo.tenantIds[1], demo.adminId]
      );
      reportIds.push(Number(investigatingReport.rows[0].id));
      await executor.query(
        `
          INSERT INTO listing_report_events (report_id, actor_id, actor_role, previous_status, new_status, note)
          VALUES ($1, $2, 'TENANT', NULL, 'OPEN', NULL),
                 ($1, $3, 'ADMIN', 'OPEN', 'INVESTIGATING', 'Dang doi chieu voi landlord.')
        `,
        [reportIds[1], demo.tenantIds[1], demo.adminId]
      );

      const resolvedReport = await executor.query(
        `
          INSERT INTO listing_reports (
            listing_id, reporter_id, category, details, status, resolution_note, assigned_admin_id, resolved_at
          ) VALUES (
            $1, $2, 'ALREADY_RENTED', 'Tin demo da duoc xu ly de kiem tra lich su.', 'RESOLVED',
            'Da xac minh va cap nhat lai thong tin tin dang.', $3, CURRENT_TIMESTAMP
          )
          RETURNING id
        `,
        [listingIds.get("demo-approved-apartment-1"), demo.tenantIds[0], demo.adminId]
      );
      reportIds.push(Number(resolvedReport.rows[0].id));
      await executor.query(
        `
          INSERT INTO listing_report_events (report_id, actor_id, actor_role, previous_status, new_status, note)
          VALUES ($1, $2, 'TENANT', NULL, 'OPEN', NULL),
                 ($1, $3, 'ADMIN', 'OPEN', 'INVESTIGATING', 'Da tiep nhan bao cao.'),
                 ($1, $3, 'ADMIN', 'INVESTIGATING', 'RESOLVED', 'Da xac minh va xu ly.')
        `,
        [reportIds[2], demo.tenantIds[0], demo.adminId]
      );

      return { listingIds, moderationHistoryIds, reportIds };
    });
  } finally {
    await client.end();
  }
}

async function seedEngagement(demo, listingData) {
  const client = await connect("rentmate_engagement");
  try {
    return await transaction(client, async (executor) => {
      const listing = (code) => listingData.listingIds.get(code);
      const landlord = (index) => demo.landlordIds[index];
      const tenant = (index) => demo.tenantIds[index];
      const inquiryIds = new Map();
      const roommateIds = new Map();

      const insertInquiry = async (input) => {
        const result = await executor.query(
          `
            INSERT INTO listing_inquiries (
              tenant_id, landlord_id, listing_id, status, contact_phone, preferred_contact_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `,
          [
            input.tenantId,
            input.landlordId,
            input.listingId,
            input.status,
            input.contactPhone,
            input.preferredContactAt
          ]
        );
        return Number(result.rows[0].id);
      };
      const insertMessage = async (inquiryId, senderId, senderRole, body, readAt) => {
        await executor.query(
          `
            INSERT INTO inquiry_messages (
              inquiry_id, sender_id, sender_role, body, tenant_read_at, landlord_read_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            inquiryId,
            senderId,
            senderRole,
            body,
            senderRole === "TENANT" ? readAt : null,
            senderRole === "LANDLORD" ? readAt : null
          ]
        );
      };
      const insertNotification = async (recipientId, eventType, inquiryId) => {
        await executor.query(
          `
            INSERT INTO notifications (recipient_id, event_type, inquiry_id, resource_path)
            VALUES ($1, $2, $3, $4)
          `,
          [recipientId, eventType, inquiryId, `/inquiries/${inquiryId}`]
        );
      };

      const inquiry1 = await insertInquiry({
        tenantId: tenant(0),
        landlordId: landlord(0),
        listingId: listing("demo-approved-room-1"),
        status: "NEW",
        contactPhone: "+84980000001",
        preferredContactAt: new Date(Date.now() + 86_400_000)
      });
      inquiryIds.set("new", inquiry1);
      await insertMessage(inquiry1, tenant(0), "TENANT", "Chao anh chi, phong nay con trong khong?", null);
      await insertNotification(landlord(0), "INQUIRY_CREATED", inquiry1);

      const inquiry2 = await insertInquiry({
        tenantId: tenant(0),
        landlordId: landlord(1),
        listingId: listing("demo-approved-studio-1"),
        status: "CONTACTED",
        contactPhone: "+84980000001",
        preferredContactAt: null
      });
      inquiryIds.set("contacted", inquiry2);
      await insertMessage(inquiry2, tenant(0), "TENANT", "Minh muon xem phong vao cuoi tuan nay.", new Date());
      await insertMessage(inquiry2, landlord(1), "LANDLORD", "Duoc ban nhe, minh co the hen ban luc 10 gio.", null);
      await insertNotification(tenant(0), "MESSAGE_CREATED", inquiry2);
      await insertNotification(tenant(0), "INQUIRY_STATUS_CHANGED", inquiry2);

      const inquiry3 = await insertInquiry({
        tenantId: tenant(1),
        landlordId: landlord(2),
        listingId: listing("demo-approved-studio-2"),
        status: "CLOSED",
        contactPhone: "+84980000002",
        preferredContactAt: null
      });
      inquiryIds.set("reviewed", inquiry3);
      await insertMessage(inquiry3, tenant(1), "TENANT", "Minh da xem phong va muon hoi them ve chi phi.", new Date());
      await insertMessage(
        inquiry3,
        landlord(2),
        "LANDLORD",
        "Cam on ban, minh da gui day du thong tin chi phi.",
        new Date()
      );

      const inquiry4 = await insertInquiry({
        tenantId: tenant(1),
        landlordId: landlord(0),
        listingId: listing("demo-approved-room-2"),
        status: "CLOSED",
        contactPhone: "+84980000002",
        preferredContactAt: null
      });
      inquiryIds.set("pendingReview", inquiry4);
      await insertMessage(inquiry4, tenant(1), "TENANT", "Minh muon de lai danh gia sau khi xem phong.", new Date());
      await insertMessage(inquiry4, landlord(0), "LANDLORD", "Cam on ban da quan tam den tin dang.", new Date());

      await executor.query(
        `
          INSERT INTO saved_searches (
            tenant_id, name, is_active, q, area_name, min_monthly_rent, max_monthly_rent,
            min_room_area_sqm, max_room_area_sqm, property_type_code, amenity_codes, mode, sort
          ) VALUES
            ($1, 'Phong gan Quan 3', true, NULL, 'Quan 3', 3000000, 7000000, 18, 40, 'ROOM', ARRAY['WIFI', 'PRIVATE_BATHROOM'], 'ordinary', 'rent_asc'),
            ($2, 'Studio gan trung tam', true, NULL, 'Binh Thanh', 5000000, 10000000, 25, 50, 'STUDIO', ARRAY['AIR_CONDITIONING'], 'ordinary', 'newest')
        `,
        [tenant(0), tenant(1)]
      );
      await executor.query(
        `
          INSERT INTO saved_searches (
            tenant_id, name, is_active, q, area_name, min_monthly_rent, max_monthly_rent,
            min_room_area_sqm, max_room_area_sqm, property_type_code, amenity_codes, mode,
            center_lat, center_lng, radius_km, sort
          ) VALUES ($1, 'Gan toi trong ban kinh 5km', true, NULL, NULL, 3000000, 9000000, NULL, NULL, NULL, ARRAY['WIFI'], 'radius', 10.7769, 106.7009, 5, 'distance_asc')
        `,
        [tenant(0)]
      );
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, listing_id, resource_path, dedupe_key)
          SELECT searches.tenant_id, 'SAVED_SEARCH_MATCHED', $2, '/listings/' || ($2::integer)::text,
                 'saved-search:' || searches.id::text || ':listing:' || ($2::integer)::text
          FROM saved_searches AS searches
          WHERE searches.tenant_id = $1
            AND searches.name IN ('Phong gan Quan 3', 'Gan toi trong ban kinh 5km')
          ON CONFLICT DO NOTHING
        `,
        [tenant(0), listing("demo-approved-room-1")]
      );

      await executor.query(
        `
          INSERT INTO favorites (tenant_id, listing_id) VALUES
            ($1, $2), ($1, $3), ($4, $5)
          ON CONFLICT DO NOTHING
        `,
        [
          tenant(0),
          listing("demo-approved-room-1"),
          listing("demo-approved-apartment-1"),
          tenant(1),
          listing("demo-approved-studio-2")
        ]
      );
      await executor.query(
        `
          INSERT INTO tenant_listing_notes (tenant_id, listing_id, note)
          VALUES ($1, $2, 'Thich phong nay vi gan truong va co cho de xe.')
        `,
        [tenant(0), listing("demo-approved-room-1")]
      );
      await executor.query(
        `
          INSERT INTO landlord_lead_notes (inquiry_id, landlord_id, note)
          VALUES
            ($1, $2, 'Can goi lai cho tenant vao buoi toi.'),
            ($3, $4, 'Tenant quan tam den studio va da duoc phan hoi.')
        `,
        [inquiry1, landlord(0), inquiry2, landlord(1)]
      );
      await executor.query(
        `
          INSERT INTO landlord_lead_reminders (inquiry_id, landlord_id, remind_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 day')
        `,
        [inquiry1, landlord(0)]
      );

      await executor.query(
        `
          INSERT INTO listing_reviews (
            inquiry_id, listing_id, tenant_id, overall_rating, accuracy_rating, responsiveness_rating,
            comment, status, moderation_note, reviewed_by_admin_id, reviewed_at
          ) VALUES
            ($1, $2, $3, 5, 5, 4, 'Phong dung mo ta, chu nha phan hoi nhanh va lich su.', 'APPROVED', 'Noi dung phu hop.', $4, CURRENT_TIMESTAMP),
            ($5, $6, $7, 4, 4, 5, 'Trai nghiem tot, dang cho admin duyet de hien thi cong khai.', 'PENDING', NULL, NULL, NULL)
        `,
        [
          inquiry3,
          listing("demo-approved-studio-2"),
          tenant(1),
          demo.adminId,
          inquiry4,
          listing("demo-approved-room-2"),
          tenant(1)
        ]
      );

      for (const code of ["demo-approved-room-1", "demo-approved-studio-1", "demo-approved-studio-2"]) {
        const historyId = listingData.moderationHistoryIds.get(code);
        const listingId = listing(code);
        const ownerIndex = code === "demo-approved-studio-2" ? 2 : code === "demo-approved-studio-1" ? 1 : 0;
        await executor.query(
          `
            INSERT INTO notifications (recipient_id, event_type, listing_id, resource_path, dedupe_key)
            VALUES ($1, 'LISTING_APPROVED', $2, $3, $4)
            ON CONFLICT DO NOTHING
          `,
          [landlord(ownerIndex), listingId, `/landlord/listings/${listingId}`, `seed-listing-moderation:${historyId}`]
        );
      }
      const rejectedHistoryId = listingData.moderationHistoryIds.get("demo-rejected-room-1");
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, listing_id, resource_path, dedupe_key)
          VALUES ($1, 'LISTING_REJECTED', $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
        [
          landlord(1),
          listing("demo-rejected-room-1"),
          `/landlord/listings/${listing("demo-rejected-room-1")}`,
          `seed-listing-moderation:${rejectedHistoryId}`
        ]
      );
      const hiddenHistoryId = listingData.moderationHistoryIds.get("demo-hidden-room-1");
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, listing_id, resource_path, dedupe_key)
          VALUES ($1, 'LISTING_HIDDEN', $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
        [
          landlord(2),
          listing("demo-hidden-room-1"),
          `/landlord/listings/${listing("demo-hidden-room-1")}`,
          `seed-listing-moderation:${hiddenHistoryId}`
        ]
      );

      const profileInputs = [
        {
          tenantId: tenant(0),
          intro: "Minh dang tim ban o ghep tai Quan 3, uu tien khong gian yen tinh va sach se.",
          sleep: "STANDARD",
          cleanliness: "TIDY",
          noise: "QUIET",
          smoking: "SMOKE_FREE",
          pets: "NO_PETS"
        },
        {
          tenantId: tenant(1),
          intro: "Minh muon tim nguoi o ghep co lich sinh hoat on dinh va ton trong khong gian chung.",
          sleep: "STANDARD",
          cleanliness: "TIDY",
          noise: "SOCIAL",
          smoking: "SMOKE_FREE",
          pets: "NO_PETS"
        },
        {
          tenantId: tenant(2),
          intro: "Minh da co ke hoach o ghep va muon trao doi ro rang ve chi phi va lich sinh hoat.",
          sleep: "EARLY",
          cleanliness: "BALANCED",
          noise: "QUIET",
          smoking: "SMOKE_FREE",
          pets: "NO_PETS"
        },
        {
          tenantId: tenant(3),
          intro: "Minh quan tam den mot cuoc song o ghep lich su, minh bach va ton trong rieng tu.",
          sleep: "EARLY",
          cleanliness: "BALANCED",
          noise: "QUIET",
          smoking: "SMOKE_FREE",
          pets: "NO_PETS"
        }
      ];
      for (const profile of profileInputs) {
        await executor.query(
          `
            INSERT INTO roommate_profiles (
              tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference, smoking_environment, pet_environment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            profile.tenantId,
            profile.intro,
            profile.sleep,
            profile.cleanliness,
            profile.noise,
            profile.smoking,
            profile.pets
          ]
        );
      }

      const insertRoommateRequest = async (input) => {
        const result = await executor.query(
          `
            INSERT INTO roommate_requests (
              owner_tenant_id, listing_id, preferred_area_keys, budget_min_per_person, budget_max_per_person,
              move_in_from, move_in_until, note, status, expires_at, listing_linked_at
            ) VALUES ($1, $2, $3::text[], $4, $5, CURRENT_DATE + $6::integer, CURRENT_DATE + $7::integer,
                      $8, $9, CURRENT_TIMESTAMP + INTERVAL '30 days',
                      CASE WHEN $2::integer IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
            RETURNING id
          `,
          [
            input.ownerTenantId,
            input.listingId,
            input.preferredAreaKeys,
            input.budgetMinPerPerson,
            input.budgetMaxPerPerson,
            input.moveInFromDays,
            input.moveInUntilDays,
            input.note,
            input.status
          ]
        );
        return Number(result.rows[0].id);
      };
      const linkedOpenRequest = await insertRoommateRequest({
        ownerTenantId: tenant(0),
        listingId: listing("demo-approved-room-1"),
        preferredAreaKeys: ["quan-3", "binh-thanh"],
        budgetMinPerPerson: 4_000_000,
        budgetMaxPerPerson: 5_500_000,
        moveInFromDays: 14,
        moveInUntilDays: 45,
        note: "Minh dang tim mot ban o ghep de cung thue phong tai Quan 3.",
        status: "OPEN"
      });
      roommateIds.set("linkedOpenRequest", linkedOpenRequest);
      const unlinkedOpenRequest = await insertRoommateRequest({
        ownerTenantId: tenant(1),
        listingId: null,
        preferredAreaKeys: ["quan-3"],
        budgetMinPerPerson: 4_200_000,
        budgetMaxPerPerson: 5_400_000,
        moveInFromDays: 18,
        moveInUntilDays: 48,
        note: "Minh chua chot phong va muon tim ban o ghep de cung tim cho phu hop.",
        status: "OPEN"
      });
      roommateIds.set("unlinkedOpenRequest", unlinkedOpenRequest);
      const connectedRequest = await insertRoommateRequest({
        ownerTenantId: tenant(2),
        listingId: null,
        preferredAreaKeys: ["phu-nhuan"],
        budgetMinPerPerson: 4_500_000,
        budgetMaxPerPerson: 5_500_000,
        moveInFromDays: 10,
        moveInUntilDays: 40,
        note: "Request demo da duoc chap nhan de xem luong hoi thoai va safety.",
        status: "MATCHED"
      });
      roommateIds.set("connectedRequest", connectedRequest);

      const pendingInterest = await executor.query(
        `
          INSERT INTO roommate_interests (request_id, interested_tenant_id)
          VALUES ($1, $2)
          RETURNING id
        `,
        [linkedOpenRequest, tenant(1)]
      );
      const pendingInterestId = Number(pendingInterest.rows[0].id);
      roommateIds.set("pendingInterest", pendingInterestId);
      await executor.query("INSERT INTO roommate_messages (interest_id, sender_tenant_id, body) VALUES ($1, $2, $3)", [
        pendingInterestId,
        tenant(1),
        "Chao ban, minh muon trao doi them ve lich chuyen vao va chi phi nhe."
      ]);
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, roommate_interest_id, resource_path)
          VALUES ($1, 'ROOMMATE_INTEREST_RECEIVED', $2, $3)
        `,
        [tenant(0), pendingInterestId, `/roommates/interests/incoming`]
      );

      const acceptedInterest = await executor.query(
        `
          INSERT INTO roommate_interests (request_id, interested_tenant_id, status, accepted_at)
          VALUES ($1, $2, 'ACCEPTED', CURRENT_TIMESTAMP)
          RETURNING id
        `,
        [connectedRequest, tenant(3)]
      );
      const acceptedInterestId = Number(acceptedInterest.rows[0].id);
      roommateIds.set("acceptedInterest", acceptedInterestId);
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, roommate_interest_id, resource_path)
          VALUES ($1, 'ROOMMATE_INTEREST_ACCEPTED', $2, $3)
        `,
        [tenant(3), acceptedInterestId, `/roommates/connections/current`]
      );

      const benignMessage = await executor.query(
        `
          INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, read_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          RETURNING id
        `,
        [acceptedInterestId, tenant(3), "Chao ban, minh rat vui vi chung ta co the trao doi ve lich chuyen vao."]
      );
      roommateIds.set("benignMessage", Number(benignMessage.rows[0].id));
      await executor.query(
        `
          INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, read_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `,
        [
          acceptedInterestId,
          tenant(2),
          "Cam on ban, minh se sap xep mot buoi trao doi ngan de thong nhat sinh hoat chung."
        ]
      );
      const safetyMessage = await executor.query(
        `
          INSERT INTO roommate_messages (interest_id, sender_tenant_id, body)
          VALUES ($1, $2, $3)
          RETURNING id, body, created_at
        `,
        [
          acceptedInterestId,
          tenant(2),
          "De xac minh nhanh, ban gui giup minh ma OTP dang nhap va mat khau tai khoan duoc khong?"
        ]
      );
      const safetyMessageId = Number(safetyMessage.rows[0].id);
      roommateIds.set("safetyMessage", safetyMessageId);
      await executor.query(
        `
          INSERT INTO roommate_message_ai_safety_analyses (
            message_id, analysis_version, prompt_version, schema_version, provider, model_identifier,
            status, attempt_count, outcome, signal_codes, evidence_message_ids, analyzed_at
          ) VALUES (
            $1, 'ROOMMATE_AI_SAFETY_V3_1', 'ROOMMATE_AI_SAFETY_PROMPT_V1', 'ROOMMATE_AI_SAFETY_SCHEMA_V1',
            'GEMINI', 'gemini-2.5-flash', 'COMPLETED', 1, 'HIGH_CAUTION',
            ARRAY['OTP_REQUEST', 'CREDENTIAL_REQUEST']::text[], ARRAY[$1]::integer[], CURRENT_TIMESTAMP
          )
        `,
        [safetyMessageId]
      );
      const reportEvidence = JSON.stringify({
        kind: "ROOMMATE_MESSAGE",
        messageId: safetyMessageId,
        body: safetyMessage.rows[0].body,
        createdAt: safetyMessage.rows[0].created_at
      });
      const safetyReport = await executor.query(
        `
          INSERT INTO contact_reports (
            inquiry_id, reporter_id, source, roommate_request_id, roommate_message_id,
            subject_tenant_id, target_type, category, details, evidence_snapshot
          ) VALUES (NULL, $1, 'ROOMMATE', $2, $3, NULL, 'ROOMMATE_MESSAGE', 'FRAUD', $4, $5::jsonb)
          RETURNING id
        `,
        [
          tenant(3),
          connectedRequest,
          safetyMessageId,
          "Tin nhan demo yeu cau OTP va thong tin dang nhap.",
          reportEvidence
        ]
      );
      const safetyReportId = Number(safetyReport.rows[0].id);
      roommateIds.set("safetyReport", safetyReportId);
      await executor.query(
        `
          INSERT INTO contact_report_events (report_id, actor_id, actor_role, previous_status, new_status)
          VALUES ($1, $2, 'TENANT', NULL, 'OPEN')
        `,
        [safetyReportId, tenant(3)]
      );
      await executor.query(
        `
          INSERT INTO notifications (recipient_id, event_type, roommate_interest_id, resource_path)
          VALUES ($1, 'ROOMMATE_MESSAGE_RECEIVED', $2, $3)
        `,
        [tenant(3), acceptedInterestId, `/roommates/interests/${acceptedInterestId}/conversation`]
      );

      return { inquiryIds, roommateIds };
    });
  } finally {
    await client.end();
  }
}

async function main() {
  const demo = await seedIdentity();
  const oldListingIds = await existingDemoListingIds(demo.landlordIds);
  await cleanEngagement(demo, oldListingIds);
  const listingData = await seedListing(demo, oldListingIds);
  const engagementData = await seedEngagement(demo, listingData);

  console.log("RentMate development data seeded successfully.");
  console.log(`Accounts: ${demoUsers.length}`);
  console.log(`Listings: ${listingData.listingIds.size}`);
  console.log(`Inquiries: ${engagementData.inquiryIds.size}`);
  console.log("Roommate requests: 3");
  console.log("Roommate interests: 2");
  console.log(`Roommate demo records: ${engagementData.roommateIds.size}`);
  console.log(`Email suffix: @rentmate.local`);
  console.log(`Development password: ${developmentPassword}`);
  console.log("Demo accounts:");
  for (const user of demoUsers) console.log(`- ${user.role}: ${user.email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
