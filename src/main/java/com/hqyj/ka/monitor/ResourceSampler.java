package com.hqyj.ka.monitor;

import org.springframework.stereotype.Component;

import java.util.ArrayDeque;

/**
 * 资源告警只看调度器采到的连续样本。页面刷新只读当前值,不会把一次抖动凑成连续样本。
 */
@Component
public class ResourceSampler {

    private final ArrayDeque<Integer> heapHigh = new ArrayDeque<>();
    private final ArrayDeque<Integer> diskTight = new ArrayDeque<>();
    private final ArrayDeque<Integer> queueDepth = new ArrayDeque<>();

    public synchronized void record(boolean heapKnown, boolean heapHigh, boolean diskKnown, boolean diskTight, int queue) {
        push(this.heapHigh, heapKnown ? (heapHigh ? 1 : 0) : -1);
        push(this.diskTight, diskKnown ? (diskTight ? 1 : 0) : -1);
        push(queueDepth, queue);
    }

    public synchronized int heapHighStreak() {
        return streak(heapHigh, 1);
    }

    public synchronized int diskTightStreak() {
        return streak(diskTight, 1);
    }

    public synchronized boolean queueSustained(int high, int growthFloor) {
        if (queueDepth.size() < 3) return false;
        Integer[] last = lastThree(queueDepth);
        if (last[0] < 0 || last[1] < 0 || last[2] < 0) return false;
        boolean piled = last[0] >= high && last[1] >= high && last[2] >= high;
        boolean growing = last[0] < last[1] && last[1] < last[2] && last[2] >= growthFloor;
        return piled || growing;
    }

    private static void push(ArrayDeque<Integer> values, int value) {
        values.addLast(value);
        while (values.size() > 8) values.removeFirst();
    }

    private static int streak(ArrayDeque<Integer> values, int expected) {
        int count = 0;
        var it = values.descendingIterator();
        while (it.hasNext()) {
            if (it.next() != expected) break;
            count++;
        }
        return count;
    }

    private static Integer[] lastThree(ArrayDeque<Integer> values) {
        Integer[] last = new Integer[3];
        int index = 3;
        var it = values.descendingIterator();
        while (it.hasNext() && index > 0) last[--index] = it.next();
        return last;
    }
}
