export const expectedEnumTypes = [
  {
    name: "listing_status",
    labels: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"]
  },
  {
    name: "user_role",
    labels: ["TENANT", "LANDLORD", "ADMIN"]
  }
] as const;

export const expectedProductTables = [
  "amenities",
  "favorites",
  "listing_amenities",
  "listing_images",
  "listings",
  "moderation_history",
  "property_types",
  "users"
] as const;

export const expectedColumnSignatures = [
  "amenities|1|id|smallint|int2|-|-|NO|YES|ALWAYS|-",
  "amenities|2|code|character varying|varchar|40|-|NO|NO|-|-",
  "amenities|3|label|character varying|varchar|80|-|NO|NO|-|-",
  "amenities|4|is_active|boolean|bool|-|-|NO|NO|-|true",
  "favorites|1|tenant_id|integer|int4|-|-|NO|NO|-|-",
  "favorites|2|listing_id|integer|int4|-|-|NO|NO|-|-",
  "favorites|3|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "listing_amenities|1|listing_id|integer|int4|-|-|NO|NO|-|-",
  "listing_amenities|2|amenity_id|smallint|int2|-|-|NO|NO|-|-",
  "listing_images|1|id|integer|int4|-|-|NO|YES|ALWAYS|-",
  "listing_images|2|listing_id|integer|int4|-|-|NO|NO|-|-",
  "listing_images|3|cloudinary_public_id|character varying|varchar|255|-|NO|NO|-|-",
  "listing_images|4|secure_url|character varying|varchar|2048|-|NO|NO|-|-",
  "listing_images|5|format|character varying|varchar|16|-|NO|NO|-|-",
  "listing_images|6|width|integer|int4|-|-|NO|NO|-|-",
  "listing_images|7|height|integer|int4|-|-|NO|NO|-|-",
  "listing_images|8|byte_size|integer|int4|-|-|NO|NO|-|-",
  "listing_images|9|display_order|smallint|int2|-|-|NO|NO|-|-",
  "listing_images|10|alt_text|character varying|varchar|255|-|YES|NO|-|-",
  "listing_images|11|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "listings|1|id|integer|int4|-|-|NO|YES|ALWAYS|-",
  "listings|2|landlord_id|integer|int4|-|-|NO|NO|-|-",
  "listings|3|property_type_id|smallint|int2|-|-|YES|NO|-|-",
  "listings|4|status|USER-DEFINED|listing_status|-|-|NO|NO|-|'DRAFT'::listing_status",
  "listings|5|title|character varying|varchar|160|-|YES|NO|-|-",
  "listings|6|description|text|text|-|-|YES|NO|-|-",
  "listings|7|monthly_rent|numeric|numeric|-|12,0|YES|NO|-|-",
  "listings|8|room_area_sqm|numeric|numeric|-|8,2|YES|NO|-|-",
  "listings|9|address_text|character varying|varchar|500|-|YES|NO|-|-",
  "listings|10|area_name|character varying|varchar|120|-|YES|NO|-|-",
  "listings|11|latitude|double precision|float8|-|-|YES|NO|-|-",
  "listings|12|longitude|double precision|float8|-|-|YES|NO|-|-",
  "listings|13|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "listings|14|updated_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "moderation_history|1|id|integer|int4|-|-|NO|YES|ALWAYS|-",
  "moderation_history|2|listing_id|integer|int4|-|-|NO|NO|-|-",
  "moderation_history|3|admin_id|integer|int4|-|-|NO|NO|-|-",
  "moderation_history|4|previous_status|USER-DEFINED|listing_status|-|-|NO|NO|-|-",
  "moderation_history|5|new_status|USER-DEFINED|listing_status|-|-|NO|NO|-|-",
  "moderation_history|6|reason|character varying|varchar|1000|-|YES|NO|-|-",
  "moderation_history|7|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "property_types|1|id|smallint|int2|-|-|NO|YES|ALWAYS|-",
  "property_types|2|code|character varying|varchar|32|-|NO|NO|-|-",
  "property_types|3|label|character varying|varchar|80|-|NO|NO|-|-",
  "property_types|4|is_active|boolean|bool|-|-|NO|NO|-|true",
  "users|1|id|integer|int4|-|-|NO|YES|ALWAYS|-",
  "users|2|role|USER-DEFINED|user_role|-|-|NO|NO|-|-",
  "users|3|email|character varying|varchar|320|-|NO|NO|-|-",
  "users|4|phone_e164|character varying|varchar|16|-|YES|NO|-|-",
  "users|5|password_hash|character varying|varchar|100|-|NO|NO|-|-",
  "users|6|is_active|boolean|bool|-|-|NO|NO|-|true",
  "users|7|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP",
  "users|8|updated_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP"
] as const;

export const expectedNamedConstraints = [
  ["amenities", "ck_amenities_code", "c"],
  ["amenities", "ck_amenities_label", "c"],
  ["amenities", "pk_amenities", "p"],
  ["amenities", "uq_amenities_code", "u"],
  ["amenities", "uq_amenities_label", "u"],
  ["favorites", "fk_favorites_listing", "f"],
  ["favorites", "fk_favorites_tenant", "f"],
  ["favorites", "pk_favorites", "p"],
  ["listing_amenities", "fk_listing_amenities_amenity", "f"],
  ["listing_amenities", "fk_listing_amenities_listing", "f"],
  ["listing_amenities", "pk_listing_amenities", "p"],
  ["listing_images", "ck_listing_images_alt_text", "c"],
  ["listing_images", "ck_listing_images_byte_size", "c"],
  ["listing_images", "ck_listing_images_dimensions", "c"],
  ["listing_images", "ck_listing_images_display_order", "c"],
  ["listing_images", "ck_listing_images_format", "c"],
  ["listing_images", "ck_listing_images_public_id", "c"],
  ["listing_images", "ck_listing_images_secure_url", "c"],
  ["listing_images", "fk_listing_images_listing", "f"],
  ["listing_images", "pk_listing_images", "p"],
  ["listing_images", "uq_listing_images_cloudinary_public_id", "u"],
  ["listing_images", "uq_listing_images_listing_display_order", "u"],
  ["listings", "ck_listings_address_text", "c"],
  ["listings", "ck_listings_area_name", "c"],
  ["listings", "ck_listings_coordinate_pair", "c"],
  ["listings", "ck_listings_description", "c"],
  ["listings", "ck_listings_latitude", "c"],
  ["listings", "ck_listings_longitude", "c"],
  ["listings", "ck_listings_monthly_rent", "c"],
  ["listings", "ck_listings_non_draft_complete", "c"],
  ["listings", "ck_listings_room_area", "c"],
  ["listings", "ck_listings_title", "c"],
  ["listings", "fk_listings_landlord", "f"],
  ["listings", "fk_listings_property_type", "f"],
  ["listings", "pk_listings", "p"],
  ["moderation_history", "ck_moderation_history_reason_nonblank", "c"],
  ["moderation_history", "ck_moderation_history_reason_required", "c"],
  ["moderation_history", "ck_moderation_history_status_changed", "c"],
  ["moderation_history", "ck_moderation_history_transition", "c"],
  ["moderation_history", "fk_moderation_history_admin", "f"],
  ["moderation_history", "fk_moderation_history_listing", "f"],
  ["moderation_history", "pk_moderation_history", "p"],
  ["property_types", "ck_property_types_code", "c"],
  ["property_types", "ck_property_types_label", "c"],
  ["property_types", "pk_property_types", "p"],
  ["property_types", "uq_property_types_code", "u"],
  ["property_types", "uq_property_types_label", "u"],
  ["users", "ck_users_email_normalized", "c"],
  ["users", "ck_users_landlord_phone", "c"],
  ["users", "ck_users_phone_e164", "c"],
  ["users", "pk_users", "p"],
  ["users", "uq_users_email", "u"]
] as const;

export const expectedForeignKeys = [
  ["fk_favorites_listing", "favorites", "listing_id", "listings", "id", "c", "r"],
  ["fk_favorites_tenant", "favorites", "tenant_id", "users", "id", "c", "r"],
  ["fk_listing_amenities_amenity", "listing_amenities", "amenity_id", "amenities", "id", "r", "r"],
  ["fk_listing_amenities_listing", "listing_amenities", "listing_id", "listings", "id", "c", "r"],
  ["fk_listing_images_listing", "listing_images", "listing_id", "listings", "id", "c", "r"],
  ["fk_listings_landlord", "listings", "landlord_id", "users", "id", "r", "r"],
  ["fk_listings_property_type", "listings", "property_type_id", "property_types", "id", "r", "r"],
  ["fk_moderation_history_admin", "moderation_history", "admin_id", "users", "id", "r", "r"],
  ["fk_moderation_history_listing", "moderation_history", "listing_id", "listings", "id", "r", "r"]
] as const;

export const expectedKeyConstraints = [
  ["pk_amenities", ["id"]],
  ["pk_favorites", ["tenant_id", "listing_id"]],
  ["pk_listing_amenities", ["listing_id", "amenity_id"]],
  ["pk_listing_images", ["id"]],
  ["pk_listings", ["id"]],
  ["pk_moderation_history", ["id"]],
  ["pk_property_types", ["id"]],
  ["pk_users", ["id"]],
  ["uq_amenities_code", ["code"]],
  ["uq_amenities_label", ["label"]],
  ["uq_listing_images_cloudinary_public_id", ["cloudinary_public_id"]],
  ["uq_listing_images_listing_display_order", ["listing_id", "display_order"]],
  ["uq_property_types_code", ["code"]],
  ["uq_property_types_label", ["label"]],
  ["uq_users_email", ["email"]]
] as const;

export const expectedExplicitIndexes = [
  {
    name: "idx_favorites_tenant_created_at",
    table: "favorites",
    keys: ["tenant_id", "created_at", "listing_id"],
    directions: ["ASC", "DESC", "DESC"],
    predicate: null
  },
  {
    name: "idx_listing_amenities_amenity_listing",
    table: "listing_amenities",
    keys: ["amenity_id", "listing_id"],
    directions: ["ASC", "ASC"],
    predicate: null
  },
  {
    name: "idx_listings_approved_latitude",
    table: "listings",
    keys: ["latitude", "id"],
    directions: ["ASC", "ASC"],
    predicate: "(status = 'APPROVED'::listing_status)"
  },
  {
    name: "idx_listings_approved_longitude",
    table: "listings",
    keys: ["longitude", "id"],
    directions: ["ASC", "ASC"],
    predicate: "(status = 'APPROVED'::listing_status)"
  },
  {
    name: "idx_listings_approved_monthly_rent",
    table: "listings",
    keys: ["monthly_rent", "id"],
    directions: ["ASC", "ASC"],
    predicate: "(status = 'APPROVED'::listing_status)"
  },
  {
    name: "idx_listings_approved_property_type",
    table: "listings",
    keys: ["property_type_id", "id"],
    directions: ["ASC", "ASC"],
    predicate: "(status = 'APPROVED'::listing_status)"
  },
  {
    name: "idx_listings_approved_room_area",
    table: "listings",
    keys: ["room_area_sqm", "id"],
    directions: ["ASC", "ASC"],
    predicate: "(status = 'APPROVED'::listing_status)"
  },
  {
    name: "idx_listings_landlord_updated_at",
    table: "listings",
    keys: ["landlord_id", "updated_at", "id"],
    directions: ["ASC", "DESC", "DESC"],
    predicate: null
  },
  {
    name: "idx_listings_status_updated_at",
    table: "listings",
    keys: ["status", "updated_at", "id"],
    directions: ["ASC", "DESC", "DESC"],
    predicate: null
  },
  {
    name: "idx_moderation_history_listing_created_at",
    table: "moderation_history",
    keys: ["listing_id", "created_at", "id"],
    directions: ["ASC", "DESC", "DESC"],
    predicate: null
  }
] as const;

export const expectedPropertyTypes = [
  ["APARTMENT", "Apartment"],
  ["DORMITORY", "Dormitory"],
  ["HOUSE", "House"],
  ["ROOM", "Room"],
  ["STUDIO", "Studio"]
] as const;

export const expectedAmenities = [
  ["AIR_CONDITIONING", "Air conditioning"],
  ["BALCONY", "Balcony"],
  ["ELEVATOR", "Elevator"],
  ["FURNISHED", "Furnished"],
  ["KITCHEN", "Kitchen"],
  ["PARKING", "Parking"],
  ["PET_FRIENDLY", "Pet-friendly"],
  ["PRIVATE_BATHROOM", "Private bathroom"],
  ["REFRIGERATOR", "Refrigerator"],
  ["SECURITY", "Security"],
  ["WASHING_MACHINE", "Washing machine"],
  ["WIFI", "Wi-Fi"]
] as const;

export const highestExpectedMigrationVersion = 12;
