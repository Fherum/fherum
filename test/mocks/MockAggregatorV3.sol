// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";

contract MockAggregatorV3 is IAggregatorV3 {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;
    uint80 public answeredInRound;

    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    mapping(uint80 => Round) public rounds;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        updatedAt = block.timestamp;
        roundId = 1;
        answeredInRound = 1;
        rounds[1] = Round(answer_, block.timestamp);
    }

    function setAnswer(int256 answer_) external {
        answer = answer_;
        updatedAt = block.timestamp;
        roundId += 1;
        answeredInRound = roundId;
        rounds[roundId] = Round(answer_, block.timestamp);
    }

    bool public revertGetRound;

    function setRevertGetRound(bool on) external {
        revertGetRound = on;
    }

    /// @dev Jump to an arbitrary (e.g. new-phase) round id: phaseId << 64 | aggregatorRound.
    function setPhaseAnswer(uint80 id, int256 answer_) external {
        answer = answer_;
        updatedAt = block.timestamp;
        roundId = id;
        answeredInRound = id;
        rounds[id] = Round(answer_, block.timestamp);
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!revertGetRound, "No data present");
        Round memory r = rounds[id];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    function setUpdatedAt(uint256 ts) external {
        updatedAt = ts;
    }

    function setDecimals(uint8 decimals_) external {
        decimals = decimals_;
    }

    function setRound(uint80 roundId_, uint80 answeredInRound_) external {
        roundId = roundId_;
        answeredInRound = answeredInRound_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}
