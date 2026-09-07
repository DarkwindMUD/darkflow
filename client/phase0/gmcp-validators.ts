import typia from "typia";
import type { Phase0RoomInfo } from "./gmcp-protocol-fixture";

export const validateRoomInfo = typia.createValidate<Phase0RoomInfo>();
export const parseRoomInfo = typia.json.createValidateParse<Phase0RoomInfo>();
