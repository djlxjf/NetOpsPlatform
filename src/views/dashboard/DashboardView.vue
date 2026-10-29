<template>
  <!--
    数智机房：直接承载 3D 机房可视化监控大屏（监控态，纯只读展示）。
    与「机房规划」( /datacenter ) 共用同一个 3D 机房组件，两入口各自独立、不互相切换：
      - 数智机房  → initial-mode="monitor"  只读监控大屏（顶栏/统计/告警/动环/传感器）
      - 机房规划  → initial-mode="plan"     可编辑机房（墙体/门窗/机柜摆放等规划工具，无监控数据面板）
  -->
  <DataCenterView initial-mode="monitor" />
</template>

<script setup>
import DataCenterView from '../datacenter/DataCenterView.vue'
</script>
