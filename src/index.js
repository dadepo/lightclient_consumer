import {createLibp2p} from "libp2p";
import {TCP} from '@libp2p/tcp'
import {Mplex} from '@libp2p/mplex'
import {Noise} from "@chainsafe/libp2p-noise";
import {GossipSub} from "@chainsafe/libp2p-gossipsub";
import {Bootstrap} from "@libp2p/bootstrap";


const lodestarPeerid = process.argv[2];
if (lodestarPeerid === undefined) {
    throw new Error("Pass in the multi address of the full node to connect to as parameter to the script");
}

// const lodestarPeerid = "/ip4/127.0.0.1/tcp/9000/p2p/16Uiu2HAmMEZRyqhBk9DTqztQ1n796VfAFpc7rth69yGGK8F9kutm";

const createLCNode = async () => {
    const node = await createLibp2p({
        addresses: {
            listen: ['/ip4/0.0.0.0/tcp/0']
        },
        transports: [new TCP()],
        streamMuxers: [new Mplex()],
        connectionEncryption: [new Noise()],
        pubsub: new GossipSub({
            globalSignaturePolicy: "StrictNoSign",
            D: 8,
            Dlo: 6,
            Dhi: 12,
            Dlazy: 6,
            heartbeatInterval: 700,
            fanoutTTL: 60 * 1000,
            mcacheLength: 6,
            mcacheGossip: 3,
            seenTTL: 550 * 700,
            allowPublishToZeroPeers: true }),
        peerDiscovery: [
            new Bootstrap({
                interval: 10e3,
                list: [lodestarPeerid]
            })
        ]
    })

    await node.start()
    console.log("started node with peer id:", node.peerId.toString());
    return node
}

(async () => {

    const light_client_opt_topic = '/eth2/c2ce3aa8/light_client_optimistic_update/ssz_snappy'

    const bootstrappedNode = await createLCNode();
    bootstrappedNode.handle("/eth2/beacon_chain/req/status/1/ssz_snappy", (stuff) => {
        console.log("got status request");
    });
    let seq = 0;
    bootstrappedNode.handle("/eth2/beacon_chain/req/ping/1/ssz_snappy", (stuff) => {
        console.log("got ping");
        return ++seq;
    });

    bootstrappedNode.addEventListener('peer:discovery', async (evt) => {
        const peer = evt.detail
        console.log('Discovered:', peer.id.toString(), peer.multiaddrs.toString())
        if (lodestarPeerid.indexOf(peer.id.toString()) !== -1) {
            // Add lodestar data to the PeerStore
            await bootstrappedNode.peerStore.addressBook.set(peer.id, peer.multiaddrs);
            await bootstrappedNode.dial(peer.id)
            console.log('Added:', peer.id.toString(), "to peer store")
        }
    })

    bootstrappedNode.connectionManager.addEventListener('peer:connect', async (evt) => {
        const connection = evt.detail
        console.log('Connection established to:', connection.remotePeer.toString())
    })

    bootstrappedNode.pubsub.addEventListener("message", (evt) => {
        console.log(`Got binary data: ${evt.detail.data} on topic ${evt.detail.topic}`)
    })

    await bootstrappedNode.pubsub.subscribe(light_client_opt_topic)

})();
