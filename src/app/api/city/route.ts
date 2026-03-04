import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assembleSnapshot(snapshot: any, from: number, to: number) {
  const allDevs = (snapshot.developers ?? []) as Record<string, any>[];
  const devs = allDevs.slice(from, to);
  const devIdSet = new Set(devs.map((d) => d.id));

  // Build owned items map (direct purchases + received gifts)
  const ownedItemsMap: Record<number, string[]> = {};
  for (const row of snapshot.purchases ?? []) {
    if (!devIdSet.has(row.developer_id)) continue;
    if (!ownedItemsMap[row.developer_id]) ownedItemsMap[row.developer_id] = [];
    ownedItemsMap[row.developer_id].push(row.item_id);
  }
  for (const row of snapshot.gift_purchases ?? []) {
    const devId = row.gifted_to as number;
    if (!devIdSet.has(devId)) continue;
    if (!ownedItemsMap[devId]) ownedItemsMap[devId] = [];
    ownedItemsMap[devId].push(row.item_id);
  }

  // Build customization maps
  const customColorMap: Record<number, string> = {};
  const billboardImagesMap: Record<number, string[]> = {};
  const loadoutMap: Record<number, { crown: string | null; roof: string | null; aura: string | null }> = {};
  for (const row of snapshot.customizations ?? []) {
    if (!devIdSet.has(row.developer_id)) continue;
    const config = row.config as Record<string, unknown>;
    if (row.item_id === "custom_color" && typeof config?.color === "string") {
      customColorMap[row.developer_id] = config.color;
    }
    if (row.item_id === "billboard") {
      if (Array.isArray(config?.images)) {
        billboardImagesMap[row.developer_id] = config.images as string[];
      } else if (typeof config?.image_url === "string") {
        billboardImagesMap[row.developer_id] = [config.image_url];
      }
    }
    if (row.item_id === "loadout") {
      loadoutMap[row.developer_id] = {
        crown: (config?.crown as string) ?? null,
        roof: (config?.roof as string) ?? null,
        aura: (config?.aura as string) ?? null,
      };
    }
  }

  // Build achievements map
  const achievementsMap: Record<number, string[]> = {};
  for (const row of snapshot.achievements ?? []) {
    if (!devIdSet.has(row.developer_id)) continue;
    if (!achievementsMap[row.developer_id]) achievementsMap[row.developer_id] = [];
    achievementsMap[row.developer_id].push(row.achievement_id);
  }

  // Build raid tags map (1 active tag per building)
  const raidTagMap: Record<number, { attacker_login: string; tag_style: string; expires_at: string }> = {};
  for (const row of snapshot.raid_tags ?? []) {
    if (!devIdSet.has(row.building_id)) continue;
    raidTagMap[row.building_id] = {
      attacker_login: row.attacker_login,
      tag_style: row.tag_style,
      expires_at: row.expires_at,
    };
  }

  // Merge everything
  const developersWithItems = devs.map((dev) => ({
    ...dev,
    owned_items: ownedItemsMap[dev.id] ?? [],
    custom_color: customColorMap[dev.id] ?? null,
    billboard_images: billboardImagesMap[dev.id] ?? [],
    achievements: achievementsMap[dev.id] ?? [],
    loadout: loadoutMap[dev.id] ?? null,
    active_raid_tag: raidTagMap[dev.id] ?? null,
  }));

  return {
    developers: developersWithItems,
    stats: snapshot.stats ?? { total_developers: 0, total_contributions: 0 },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = Math.max(0, parseInt(searchParams.get("from") ?? "0", 10));
  const to = Math.min(
    from + 1000,
    parseInt(searchParams.get("to") ?? "500", 10)
  );

  const sb = getSupabaseAdmin();

  // Try cached snapshot first (pre-computed by pg_cron every 5 min)
  const { data: cached } = await sb.rpc("get_cached_city_snapshot");

  if (cached) {
    const result = assembleSnapshot(cached, from, to);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  }

  // Fallback: cache not yet populated, compute directly
  const { data: snapshot } = await sb.rpc("get_city_snapshot");

  if (!snapshot) {
    return NextResponse.json(
      { developers: [], stats: { total_developers: 0, total_contributions: 0 } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  }

  const result = assembleSnapshot(snapshot, from, to);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
