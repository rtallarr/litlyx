

import { getUserProjectFromId } from "~/server/LIVE_DEMO_DATA";
import { EventModel } from "@schema/metrics/EventSchema";
import { VisitModel } from "@schema/metrics/VisitSchema";


export default defineEventHandler(async event => {

    const project_id = getRequestProjectId(event);
    if (!project_id) return;

    const user = getRequestUser(event);

    const project = await getUserProjectFromId(project_id, user);
    if (!project) return;

    const { name: eventName } = getQuery(event);
    if (!eventName) return [];



    const allEvents = await EventModel.find({ project_id: project_id, name: eventName }, { flowHash: 1 });
    const allFlowHashes = new Map<string, number>();

    allEvents.forEach(e => {
        if (!e.flowHash) return;
        if (e.flowHash.length == 0) return;
        if (allFlowHashes.has(e.flowHash)) {
            const count = allFlowHashes.get(e.flowHash) as number;
            allFlowHashes.set(e.flowHash, count + 1);
        } else {
            allFlowHashes.set(e.flowHash, 1);
        }
    });

    const flowHashIds = Array.from(allFlowHashes.keys());

    const allReferrers: { referrer: string, flowHash: string }[] = [];

    const promises: any[] = [];
    while (flowHashIds.length > 0) {
        promises.push(new Promise<void>(async resolve => {
            const flowHashIdsChunk = flowHashIds.splice(0, 10);
            const visits = await VisitModel.find({ project_id, flowHash: { $in: flowHashIdsChunk } }, { referrer: 1, flowHash: 1 });
            allReferrers.push(...visits.map(e => { return { referrer: e.referrer, flowHash: e.flowHash } }));
            resolve();
        }));
    }

    await Promise.all(promises);

    const groupedFlows: Record<string, { referrers: string[] }> = {};

    flowHashIds.forEach(flowHash => {
        if (!groupedFlows[flowHash]) groupedFlows[flowHash] = { referrers: [] };
        const target = groupedFlows[flowHash];
        if (!target) return;
        const referrers = allReferrers.filter(e => e.flowHash === flowHash).map(e => e.referrer);
        for (const referrer of referrers) {
            if (target.referrers.includes(referrer)) continue;
            target.referrers.push(referrer);
        }
    });

    const grouped: Record<string, number> = {};

    for (const referrerPlusHash of allReferrers) {
        const referrer = referrerPlusHash.referrer;
        if (!grouped[referrer]) grouped[referrer] = 0
        grouped[referrer]++;
    }

    return grouped;

});
