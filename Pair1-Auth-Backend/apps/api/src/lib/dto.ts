import type { SchoolDto, UserDto } from "@nihongo/shared";
import { env } from "../env";
import type { SchoolDoc, UserDoc } from "../db";
import { iso, isoOrNull } from "./time";

export function userDto(uid: string, d: UserDoc): UserDto {
  return {
    uid,
    role: d.role,
    name: d.name,
    email: d.email,
    schoolId: d.schoolId ?? null,
    studyLevel: d.studyLevel ?? null,
    timeZone: d.timeZone || env.DEFAULT_TIME_ZONE,
    privacyConsentAt: isoOrNull(d.privacyConsentAt),
    disabled: d.disabled,
    createdAt: iso(d.createdAt),
  };
}

export function schoolDto(id: string, d: SchoolDoc): SchoolDto {
  return {
    id,
    name: d.name,
    timeZone: d.timeZone || env.DEFAULT_TIME_ZONE,
    createdAt: iso(d.createdAt),
  };
}
